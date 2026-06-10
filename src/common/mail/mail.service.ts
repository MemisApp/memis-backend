import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from =
      this.config.get<string>('MAIL_FROM') || 'Memis <no-reply@memis.app>';
    this.appUrl =
      this.config.get<string>('APP_PUBLIC_URL') || 'https://memis.app';
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY not set - emails will be logged instead of sent.',
      );
    }
  }

  private async send(to: string, subject: string, html: string) {
    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
      return;
    }
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html });
    } catch (e) {
      this.logger.error(`Failed to send email to ${to}`, e as Error);
    }
  }

  private layout(title: string, body: string): string {
    return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F8FAFC;padding:24px;">
      <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px;border:1px solid #E2E8F0;">
        <h1 style="font-size:20px;color:#0F172A;margin:0 0 16px;">${title}</h1>
        ${body}
        <p style="font-size:12px;color:#94A3B8;margin-top:28px;">If you did not request this, you can safely ignore this email.</p>
        <p style="font-size:12px;color:#94A3B8;">— The Memis Team</p>
      </div></body></html>`;
  }

  async sendVerificationEmail(to: string, token: string, name?: string) {
    const link = `${this.appUrl}/verify-email?token=${token}`;
    const html = this.layout(
      'Confirm your email',
      `<p style="font-size:14px;color:#334155;">Hi ${name || 'there'}, welcome to Memis. Please confirm your email address to secure your account.</p>
       <p style="margin:24px 0;"><a href="${link}" style="background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block;">Verify email</a></p>
       <p style="font-size:12px;color:#64748B;">Or paste this link into your browser:<br/>${link}</p>`,
    );
    await this.send(to, 'Confirm your Memis email', html);
  }

  async sendPasswordResetEmail(to: string, token: string, name?: string) {
    const link = `${this.appUrl}/reset-password?token=${token}`;
    const html = this.layout(
      'Reset your password',
      `<p style="font-size:14px;color:#334155;">Hi ${name || 'there'}, we received a request to reset your Memis password. This link expires in 1 hour.</p>
       <p style="margin:24px 0;"><a href="${link}" style="background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block;">Reset password</a></p>
       <p style="font-size:12px;color:#64748B;">Or paste this link into your browser:<br/>${link}</p>`,
    );
    await this.send(to, 'Reset your Memis password', html);
  }

  async sendWelcomeEmail(to: string, name?: string) {
    const html = this.layout(
      'Welcome to Memis',
      `<p style="font-size:14px;color:#334155;">Hi ${name || 'there'}, your email is verified. You now have full access to Memis, including your 7-day free trial of Memis Plus.</p>`,
    );
    await this.send(to, 'Welcome to Memis', html);
  }
}
