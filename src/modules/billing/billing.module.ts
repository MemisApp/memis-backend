import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementService } from './entitlement.service';
import { EntitlementGuard } from './entitlement.guard';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [BillingController],
  providers: [BillingService, EntitlementService, EntitlementGuard],
  exports: [BillingService, EntitlementService, EntitlementGuard],
})
export class BillingModule {}
