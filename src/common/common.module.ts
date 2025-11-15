import { Global, Module } from '@nestjs/common';
import { SanitizationService } from './sanitization.service';
import { SecurityTransformPipe } from './security-transform.pipe';

@Global()
@Module({
  providers: [SanitizationService, SecurityTransformPipe],
  exports: [SanitizationService, SecurityTransformPipe],
})
export class CommonModule {}
