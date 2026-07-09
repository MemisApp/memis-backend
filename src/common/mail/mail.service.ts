import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { buildBrandedEmailHtml } from './email-layout';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly webAppLinkBase: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY not set - emails will be logged instead of sent.',
      );
    }
    this.from =
      this.config.get<string>('MAIL_FROM') || 'Memis <no-reply@jannytech.com>';
    this.appUrl =
      this.config.get<string>('APP_PUBLIC_URL') || 'https://jannytech.com';
    this.webAppLinkBase =
      this.config.get<string>('WEB_APP_LINK_BASE') ||
      'https://jannytech.com/app';
  }

  private appLink(to: string, token: string): string {
    return `${this.webAppLinkBase}/?to=${to}&token=${encodeURIComponent(token)}`;
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

  async sendVerificationEmail(to: string, token: string, name?: string) {
    const link = this.appLink('verify-email', token);
    const html = buildBrandedEmailHtml({
      preheader: 'Confirm your Memis email to secure your account.',
      title: 'Confirm your email',
      bodyHtml: `<p style="margin:0 0 12px;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 12px;">Welcome to <strong>Memis</strong>. Please confirm your email address to activate your account and start your free trial.</p>
        <p style="margin:0;">Tap the button below on the phone or tablet where Memis is installed. If it doesn't open the app, open Memis and paste the code below.</p>`,
      cta: { label: 'Verify email', href: link },
      manualCode: token,
      manualCodeLabel: 'Or paste this confirmation code in the app',
      appUrl: this.appUrl,
    });
    await this.send(to, 'Confirm your Memis email', html);
  }

  async sendPasswordResetEmail(to: string, token: string, name?: string) {
    const link = this.appLink('reset-password', token);
    const html = buildBrandedEmailHtml({
      preheader: 'Reset your Memis password. This link expires in 1 hour.',
      title: 'Reset your password',
      bodyHtml: `<p style="margin:0 0 12px;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 12px;">We received a request to reset your Memis password. This link expires in <strong>1 hour</strong>.</p>
        <p style="margin:0 0 12px;">Tap the button below on the device where Memis is installed. If it doesn't open the app, open Memis → <strong>Forgot password</strong> → <strong>Enter code manually</strong> and paste the code below.</p>
        <p style="margin:0;">If you didn't request a reset, you can ignore this email — your password will stay the same.</p>`,
      cta: { label: 'Reset password', href: link },
      manualCode: token,
      manualCodeLabel: 'Or paste this reset code in the app',
      appUrl: this.appUrl,
    });
    await this.send(to, 'Reset your Memis password', html);
  }

  async sendWelcomeEmail(to: string, name?: string) {
    const html = buildBrandedEmailHtml({
      preheader: 'Your Memis account is ready. Start your 7-day free trial.',
      title: 'Welcome to Memis',
      bodyHtml: `<p style="margin:0 0 12px;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 12px;">Your email is verified and your account is fully active.</p>
        <p style="margin:0;">You now have access to Memis, including your <strong>7-day free trial of Memis Plus</strong>. Open the app to add a patient, set reminders, and invite family members to your care circle.</p>`,
      cta: { label: 'Open Memis', href: this.webAppLinkBase },
      appUrl: this.appUrl,
    });
    await this.send(to, 'Welcome to Memis', html);
  }

  async sendCaregiverInviteEmail(
    to: string,
    token: string,
    patientName: string,
    inviterName: string,
  ) {
    const link = this.appLink('accept-invite', token);
    const html = buildBrandedEmailHtml({
      preheader: `${inviterName} invited you to join ${patientName}'s care circle on Memis.`,
      title: 'You’re invited to a care circle',
      bodyHtml: `<p style="margin:0 0 12px;"><strong>${inviterName}</strong> has invited you to help care for <strong>${patientName}</strong> on Memis.</p>
        <p style="margin:0 0 12px;">Memis is a private care-coordination app for families supporting a loved one with Alzheimer's or dementia.</p>
        <p style="margin:0;">Open the button below on the device where Memis is installed, then <strong>create your account (or sign in) using ${to}</strong>. You'll be added to ${patientName}'s care circle automatically — no extra steps.</p>`,
      cta: { label: 'Join the care circle', href: link },
      manualCode: token,
      manualCodeLabel:
        'Or, in the app, open this invite link / paste this code',
      footerNote: 'This invitation expires in 7 days.',
      appUrl: this.appUrl,
    });
    await this.send(to, `${inviterName} invited you to Memis`, html);
  }
}
