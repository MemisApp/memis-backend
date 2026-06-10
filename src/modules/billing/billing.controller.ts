import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { EntitlementService } from './entitlement.service';

type AuthedRequest = Request & { user: { id: string; role: string } };

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current plan, limits, trial status and AI usage' })
  async getMyBilling(@Req() req: AuthedRequest) {
    const effective = await this.entitlements.getEffectivePlan(req.user.id);
    const aiUsage = await this.entitlements.getAiUsage(req.user.id);
    return {
      plan: effective.plan,
      status: effective.status,
      isActive: effective.isActive,
      trialEndsAt: effective.trialEndsAt,
      currentPeriodEnd: effective.currentPeriodEnd,
      limits: effective.limits,
      aiUsage,
    };
  }

  @Post('webhooks/revenuecat')
  @HttpCode(200)
  @ApiOperation({ summary: 'RevenueCat subscription webhook' })
  async revenueCatWebhook(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: unknown,
  ) {
    const secret = this.config.get<string>('REVENUECAT_WEBHOOK_SECRET');
    if (secret && authHeader !== `Bearer ${secret}`) {
      throw new UnauthorizedException('Invalid RevenueCat webhook signature');
    }
    return this.billing.handleRevenueCatEvent(body);
  }

  /**
   * DEV-ONLY: instantly set your own account to FREE / PLUS / FAMILY for
   * testing gating without going through RevenueCat or Stripe.
   * Blocked in production (NODE_ENV=production).
   */
  @Post('debug/set-plan/:plan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(200)
  @ApiOperation({ summary: '[DEV] Instantly set the authenticated user\'s plan' })
  async debugSetPlan(
    @Req() req: AuthedRequest,
    @Param('plan') plan: string,
  ) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Not available in production');
    }
    const upper = plan.toUpperCase() as 'FREE' | 'PLUS' | 'FAMILY';
    if (!['FREE', 'PLUS', 'FAMILY'].includes(upper)) {
      throw new ForbiddenException('plan must be FREE, PLUS, or FAMILY');
    }
    return this.billing.debugSetPlan(req.user.id, upper);
  }

  @Post('webhooks/stripe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe subscription webhook' })
  async stripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
    @Body() body: any,
  ) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (secret && !signature) {
      throw new UnauthorizedException('Missing Stripe signature');
    }
    return this.billing.handleStripeEvent(body);
  }
}
