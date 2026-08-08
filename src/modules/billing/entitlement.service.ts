import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CaregiverRole,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  currentBillingPeriod,
  EntitlementKey,
  PLAN_LIMITS,
  PlanLimits,
} from './plans';

export interface EffectivePlan {
  plan: SubscriptionPlan;
  status: SubscriptionStatus | 'NONE';
  isActive: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  limits: PlanLimits;
}

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
];

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePlan(userId: string): Promise<EffectivePlan> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    const plan = this.resolvePlan(sub);
    return {
      plan,
      status: sub?.status ?? 'NONE',
      isActive: plan !== SubscriptionPlan.FREE,
      trialEndsAt: sub?.trialEndsAt ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      limits: PLAN_LIMITS[plan],
    };
  }

  private resolvePlan(sub: Subscription | null): SubscriptionPlan {
    if (!sub) return SubscriptionPlan.FREE;
    if (!ACTIVE_STATUSES.includes(sub.status)) return SubscriptionPlan.FREE;

    const now = Date.now();
    if (
      sub.status === SubscriptionStatus.TRIALING &&
      sub.trialEndsAt &&
      sub.trialEndsAt.getTime() < now
    ) {
      return SubscriptionPlan.FREE;
    }
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now) {
      return SubscriptionPlan.FREE;
    }
    return sub.plan;
  }

  async hasEntitlement(
    userId: string,
    key: EntitlementKey,
  ): Promise<boolean> {
    const { limits } = await this.getEffectivePlan(userId);
    return limits.entitlements[key];
  }

  async assertEntitlement(userId: string, key: EntitlementKey): Promise<void> {
    if (!(await this.hasEntitlement(userId, key))) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        entitlement: key,
        message: 'This feature requires a Memis Plus or Family subscription.',
      });
    }
  }

  async assertCanCreatePatient(userId: string): Promise<void> {
    const { limits } = await this.getEffectivePlan(userId);
    const owned = await this.prisma.patientCaregiver.count({
      where: { caregiverId: userId, role: 'OWNER' },
    });
    if (owned >= limits.maxPatients) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        entitlement: 'max_patients',
        message: `Your plan allows up to ${limits.maxPatients} patient(s). Upgrade to add more.`,
      });
    }
  }

  async assertCanInviteCaregiver(
    userId: string,
    patientId: string,
  ): Promise<void> {
    const { limits } = await this.getEffectivePlan(userId);

    if (!limits.entitlements.multi_caregiver) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        entitlement: 'multi_caregiver',
        message:
          'Inviting other caregivers requires Memis Family. Upgrade to share care with your family.',
      });
    }

    const [seats, pending] = await Promise.all([
      this.prisma.patientCaregiver.count({ where: { patientId } }),
      this.prisma.caregiverInvite.count({
        where: { patientId, status: 'PENDING' },
      }),
    ]);

    if (seats + pending >= limits.maxCaregivers) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        entitlement: 'max_caregivers',
        message: `Your plan allows up to ${limits.maxCaregivers} caregivers per patient.`,
      });
    }
  }

  async getTestHistoryLimit(userId: string): Promise<number | null> {
    const { limits } = await this.getEffectivePlan(userId);
    return limits.testHistoryLimit;
  }

  /**
   * Patient devices authenticate with a Patient id, which is not a User row —
   * billing and AI quota always belong to the caregiver who owns the patient.
   * Returns null when a patient has no caregiver link yet.
   */
  async resolveBillingUserId(
    actorId: string,
    role?: string,
  ): Promise<string | null> {
    if (role !== 'PATIENT') return actorId;

    const owner = await this.prisma.patientCaregiver.findFirst({
      where: { patientId: actorId, role: CaregiverRole.OWNER },
      orderBy: { createdAt: 'asc' },
      select: { caregiverId: true },
    });
    if (owner) return owner.caregiverId;

    const anyCaregiver = await this.prisma.patientCaregiver.findFirst({
      where: { patientId: actorId },
      orderBy: { createdAt: 'asc' },
      select: { caregiverId: true },
    });
    return anyCaregiver?.caregiverId ?? null;
  }

  async consumeAiMessage(actorId: string, role?: string): Promise<void> {
    const userId = await this.resolveBillingUserId(actorId, role);
    if (!userId) return;

    const { plan, limits } = await this.getEffectivePlan(userId);
    const period = currentBillingPeriod();

    const usage = await this.prisma.aiUsage.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, count: 0 },
      update: {},
    });

    if (
      limits.aiMessagesPerMonth !== null &&
      usage.count >= limits.aiMessagesPerMonth
    ) {
      throw new ForbiddenException({
        code: 'AI_QUOTA_EXCEEDED',
        entitlement: 'ai_messages',
        message:
          plan === SubscriptionPlan.FREE
            ? `You have used your ${limits.aiMessagesPerMonth} free AI messages this month. Upgrade for unlimited access.`
            : `You have reached this month's fair-use limit of ${limits.aiMessagesPerMonth} AI messages. It resets at the start of next month.`,
      });
    }

    await this.prisma.aiUsage.update({
      where: { userId_period: { userId, period } },
      data: { count: { increment: 1 } },
    });
  }

  async getAiUsage(
    actorId: string,
    role?: string,
  ): Promise<{ used: number; limit: number | null }> {
    const userId = await this.resolveBillingUserId(actorId, role);
    const { limits } = await this.getEffectivePlan(userId ?? actorId);
    if (!userId) return { used: 0, limit: limits.aiMessagesPerMonth };

    const period = currentBillingPeriod();
    const usage = await this.prisma.aiUsage.findUnique({
      where: { userId_period: { userId, period } },
    });
    return { used: usage?.count ?? 0, limit: limits.aiMessagesPerMonth };
  }
}
