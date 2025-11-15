import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';
import { SanitizationService } from './sanitization.service';

@Injectable()
export class SecurityTransformPipe implements PipeTransform {
  constructor(private readonly sanitization: SanitizationService) {}

  transform(value: any, metadata: ArgumentMetadata) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    // Clone the object to avoid mutating the original
    const sanitized = { ...value };

    // Apply sanitization based on field names
    Object.keys(sanitized).forEach((key) => {
      const val = sanitized[key];
      
      if (typeof val === 'string') {
        // Sanitize email fields
        if (key.toLowerCase().includes('email')) {
          sanitized[key] = this.sanitization.sanitizeEmail(val);
        }
        // Sanitize phone fields
        else if (key.toLowerCase().includes('phone')) {
          sanitized[key] = this.sanitization.sanitizePhone(val);
        }
        // Sanitize file path fields
        else if (key.toLowerCase().includes('url') || key.toLowerCase().includes('path')) {
          sanitized[key] = this.sanitization.sanitizeFilePath(val);
        }
        // Default string sanitization
        else {
          sanitized[key] = this.sanitization.sanitizeString(val);
        }
      }
    });

    return sanitized;
  }
}
