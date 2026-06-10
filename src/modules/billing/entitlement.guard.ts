import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { EntitlementService } from './entitlement.service';
import { EntitlementKey } from './plans';

export const REQUIRES_ENTITLEMENT = 'requires_entitlement';

/**
 * Marks a route as requiring a paid entitlement. Use together with JwtAuthGuard
 * (which populates request.user) and EntitlementGuard.
 *
 * @example
 * @UseGuards(JwtAuthGuard, EntitlementGuard)
 * @RequiresEntitlement('clinical_insights')
 */
export const RequiresEntitlement = (key: EntitlementKey) =>
  SetMetadata(REQUIRES_ENTITLEMENT, key);

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<EntitlementKey | undefined>(
      REQUIRES_ENTITLEMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!key) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();
    const userId = req.user?.id;
    if (!userId) return false;

    await this.entitlements.assertEntitlement(userId, key);
    return true;
  }
}
