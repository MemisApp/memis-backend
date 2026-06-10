import { Injectable, Logger } from '@nestjs/common';
import {
  SubscriptionPlan,
  SubscriptionProvider,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { planFromProductId } from './plans';

const TRIAL_DAYS = 7;

interface UpsertSubscriptionInput {
  userId: string;
  provider: SubscriptionProvider;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  externalCustomerId?: string | null;
  externalSubId?: string | null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async upsert(input: UpsertSubscriptionInput) {
    return this.prisma.subscription.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        provider: input.provider,
        plan: input.plan,
        status: input.status,
        trialEndsAt: input.trialEndsAt ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        externalCustomerId: input.externalCustomerId ?? null,
        externalSubId: input.externalSubId ?? null,
      },
      update: {
        provider: input.provider,
        plan: input.plan,
        status: input.status,
        trialEndsAt: input.trialEndsAt ?? null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        externalCustomerId: input.externalCustomerId ?? undefined,
        externalSubId: input.externalSubId ?? undefined,
      },
    });
  }

  async startTrialIfEligible(userId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    return this.upsert({
      userId,
      provider: SubscriptionProvider.MANUAL,
      plan: SubscriptionPlan.PLUS,
      status: SubscriptionStatus.TRIALING,
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
    });
  }

  async handleRevenueCatEvent(body: any): Promise<{ ok: boolean }> {
    const event = body?.event ?? body;
    const userId: string | undefined = event?.app_user_id;
    if (!userId) {
      this.logger.warn('RevenueCat event missing app_user_id');
      return { ok: false };
    }

    const type: string = event?.type ?? '';
    const productId: string | undefined =
      event?.product_id ?? event?.entitlement_id ?? event?.entitlement_ids?.[0];
    const plan = planFromProductId(productId);

    const expirationMs = event?.expiration_at_ms
      ? Number(event.expiration_at_ms)
      : null;
    const currentPeriodEnd = expirationMs ? new Date(expirationMs) : null;

    let status: SubscriptionStatus;
    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE':
        status = SubscriptionStatus.ACTIVE;
        break;
      case 'TRIAL_STARTED':
        status = SubscriptionStatus.TRIALING;
        break;
      case 'CANCELLATION':
        status = SubscriptionStatus.CANCELED;
        break;
      case 'BILLING_ISSUE':
        status = SubscriptionStatus.PAST_DUE;
        break;
      case 'EXPIRATION':
        status = SubscriptionStatus.EXPIRED;
        break;
      default:
        this.logger.log(`Unhandled RevenueCat event type: ${type}`);
        status = SubscriptionStatus.ACTIVE;
    }

    await this.upsert({
      userId,
      provider: SubscriptionProvider.REVENUECAT,
      plan: status === SubscriptionStatus.EXPIRED ? SubscriptionPlan.FREE : plan,
      status,
      trialEndsAt:
        status === SubscriptionStatus.TRIALING ? currentPeriodEnd : null,
      currentPeriodEnd,
      externalCustomerId: event?.original_app_user_id ?? userId,
      externalSubId: event?.transaction_id ?? null,
    });

    return { ok: true };
  }

  async debugSetPlan(userId: string, plan: 'FREE' | 'PLUS' | 'FAMILY') {
    const result = await this.upsert({
      userId,
      provider: SubscriptionProvider.MANUAL,
      plan: SubscriptionPlan[plan],
      status: plan === 'FREE' ? SubscriptionStatus.EXPIRED : SubscriptionStatus.ACTIVE,
      trialEndsAt: null,
      currentPeriodEnd: null,
    });
    this.logger.log(`[DEBUG] Set plan for user ${userId} → ${plan}`);
    return { ok: true, plan: result.plan, status: result.status };
  }

  async handleStripeEvent(event: any): Promise<{ ok: boolean }> {
    const type: string = event?.type ?? '';
    const obj = event?.data?.object ?? {};
    const userId: string | undefined =
      obj?.metadata?.memisUserId ?? obj?.client_reference_id;

    if (!userId) {
      this.logger.warn(`Stripe event ${type} missing memisUserId metadata`);
      return { ok: false };
    }

    const priceLookup: string | undefined =
      obj?.items?.data?.[0]?.price?.lookup_key ??
      obj?.items?.data?.[0]?.price?.nickname ??
      obj?.metadata?.plan;
    const plan = planFromProductId(priceLookup);

    const periodEnd = obj?.current_period_end
      ? new Date(Number(obj.current_period_end) * 1000)
      : null;

    let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
    switch (type) {
      case 'customer.subscription.deleted':
        status = SubscriptionStatus.CANCELED;
        break;
      case 'invoice.payment_failed':
        status = SubscriptionStatus.PAST_DUE;
        break;
      case 'customer.subscription.trial_will_end':
        status = SubscriptionStatus.TRIALING;
        break;
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'invoice.paid':
      default: {
        const stripeStatus: string = obj?.status ?? 'active';
        if (stripeStatus === 'trialing') status = SubscriptionStatus.TRIALING;
        else if (stripeStatus === 'past_due')
          status = SubscriptionStatus.PAST_DUE;
        else if (stripeStatus === 'canceled')
          status = SubscriptionStatus.CANCELED;
        else status = SubscriptionStatus.ACTIVE;
      }
    }

    await this.upsert({
      userId,
      provider: SubscriptionProvider.STRIPE,
      plan: status === SubscriptionStatus.CANCELED ? SubscriptionPlan.FREE : plan,
      status,
      trialEndsAt: obj?.trial_end ? new Date(Number(obj.trial_end) * 1000) : null,
      currentPeriodEnd: periodEnd,
      externalCustomerId: obj?.customer ?? null,
      externalSubId: obj?.id ?? null,
    });

    return { ok: true };
  }
}
