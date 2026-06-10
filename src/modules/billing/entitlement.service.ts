import { ForbiddenException, Injectable } from '@nestjs/common';
import {
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

  async consumeAiMessage(userId: string): Promise<void> {
    const { limits } = await this.getEffectivePlan(userId);
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
        message: `You have used your ${limits.aiMessagesPerMonth} free AI messages this month. Upgrade for unlimited access.`,
      });
    }

    await this.prisma.aiUsage.update({
      where: { userId_period: { userId, period } },
      data: { count: { increment: 1 } },
    });
  }

  async getAiUsage(userId: string): Promise<{ used: number; limit: number | null }> {
    const { limits } = await this.getEffectivePlan(userId);
    const period = currentBillingPeriod();
    const usage = await this.prisma.aiUsage.findUnique({
      where: { userId_period: { userId, period } },
    });
    return { used: usage?.count ?? 0, limit: limits.aiMessagesPerMonth };
  }
}
