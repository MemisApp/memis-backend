import { Injectable } from '@nestjs/common';

@Injectable()
export class SanitizationService {
  /**
   * Sanitize string input to prevent XSS and other injection attacks
   */
  sanitizeString(input: string | null | undefined): string | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    return input
      .trim() // Remove leading/trailing whitespace
      .replace(/[<>'"&]/g, (match) => {
        // Basic HTML entity encoding
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;',
        };
        return entities[match] || match;
      })
      .substring(0, 1000); // Limit length to prevent buffer overflow
  }

  /**
   * Sanitize email input
   */
  sanitizeEmail(email: string): string {
    return email
      .trim()
      .toLowerCase()
      .replace(/[^\w\.\-@]/g, ''); // Only allow word chars, dots, hyphens, and @
  }

  /**
   * Sanitize phone number
   */
  sanitizePhone(phone: string): string {
    return phone
      .trim()
      .replace(/[^\d\+\-\(\)\s]/g, ''); // Only allow digits, +, -, (), spaces
  }

  /**
   * Remove null bytes and control characters
   */
  removeControlCharacters(input: string): string {
    return input.replace(/[\x00-\x1F\x7F]/g, '');
  }

  /**
   * Validate and sanitize file paths to prevent directory traversal
   */
  sanitizeFilePath(path: string): string {
    return path
      .replace(/\.\./g, '') // Remove .. sequences
      .replace(/[\/\\]/g, '') // Remove path separators
      .replace(/[^\w\.\-]/g, ''); // Only allow safe characters
  }
}
