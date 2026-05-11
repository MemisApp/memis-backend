import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { SanitizationService } from './sanitization.service';

@Injectable()
export class SecurityTransformPipe implements PipeTransform {
  constructor(private readonly sanitization: SanitizationService) {}

  transform(value: any, metadata: ArgumentMetadata) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    const sanitized = { ...value };

    Object.keys(sanitized).forEach((key) => {
      const val = sanitized[key];

      if (typeof val === 'string') {
        if (key.toLowerCase().includes('email')) {
          sanitized[key] = this.sanitization.sanitizeEmail(val);
        } else if (key.toLowerCase().includes('phone')) {
          sanitized[key] = this.sanitization.sanitizePhone(val);
        } else if (
          key.toLowerCase().includes('url') ||
          key.toLowerCase().includes('path')
        ) {
          sanitized[key] = this.sanitization.sanitizeFilePath(val);
        } else {
          sanitized[key] = this.sanitization.sanitizeString(val);
        }
      }
    });

    return sanitized;
  }
}
