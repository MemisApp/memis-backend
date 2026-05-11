import { Injectable } from '@nestjs/common';

@Injectable()
export class SanitizationService {
  sanitizeString(input: string | null | undefined): string | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    return input
      .trim()
      .replace(/[<>'"&]/g, (match) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;',
        };
        return entities[match] || match;
      })
      .substring(0, 1000);
  }

  sanitizeEmail(email: string): string {
    return email
      .trim()
      .toLowerCase()
      .replace(/[^\w\.\-@]/g, '');
  }

  sanitizePhone(phone: string): string {
    return phone.trim().replace(/[^\d\+\-\(\)\s]/g, '');
  }

  removeControlCharacters(input: string): string {
    return input.replace(/[\x00-\x1F\x7F]/g, '');
  }

  sanitizeFilePath(path: string): string {
    return path
      .replace(/\.\./g, '')
      .replace(/[\/\\]/g, '')
      .replace(/[^\w\.\-]/g, '');
  }
}
