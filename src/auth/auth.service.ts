import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Role, Workplace } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { BillingService } from '../modules/billing/billing.service';
import { MailService } from '../common/mail/mail.service';

interface DeviceInfo {
  platform: string;
  deviceName: string;
  deviceId: string;
}

// SECURITY: access tokens are short-lived; clients refresh via POST /auth/refresh.
const DEFAULT_ACCESS_TTL = '30m';
const REFRESH_TTL_DAYS = 30;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
export const TERMS_VERSION = '2026-06-10';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private billing: BillingService,
    private mail: MailService,
  ) {}

  private async hash(data: string) {
    return bcrypt.hash(data, 12);
  }

  private async verify(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }

  /** High-entropy URL-safe token plus a fast sha256 hash for DB lookup. */
  private makeToken(): { raw: string; hashed: string } {
    const raw = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, hashed };
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists)
      throw new ConflictException('User with this email already exists');

    const passwordHash = await this.hash(dto.password);
    const verifyToken = this.makeToken();
    const verifyExpiresAt = new Date();
    verifyExpiresAt.setDate(verifyExpiresAt.getDate() + 7);
    const now = new Date();

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        // SECURITY: doctor self-registration is disabled for launch. Only
        // CAREGIVER accounts can self-register; doctors are provisioned by an
        // admin. The workplace/profession/title branches are retained but only
        // apply if an admin re-enables the DOCTOR role in RegisterDto.
        role: dto.role as Role,
        workplace: dto.role === 'DOCTOR' ? (dto.workplace as Workplace) : null,
        profession: dto.role === 'DOCTOR' ? dto.profession : null,
        title: dto.role === 'DOCTOR' ? dto.title : null,
        avatarUrl: dto.avatarUrl || null,
        emailVerifyToken: verifyToken.hashed,
        emailVerifyExpiresAt: verifyExpiresAt,
        // GDPR: record consent captured at sign-up (frontend requires it).
        acceptedTermsAt: dto.acceptedTerms ? now : null,
        acceptedPrivacyAt: dto.acceptedPrivacy ? now : null,
        termsVersion: dto.acceptedTerms ? TERMS_VERSION : null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        workplace: true,
        profession: true,
        title: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: '-',
        ip,
        userAgent,
        expiresAt,
      },
    });

    const refreshToken = await this.signRefreshToken(
      user.id,
      session.id,
      expiresAt,
    );
    const refreshTokenHash = await this.hash(refreshToken);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash },
    });

    const accessToken = await this.signAccessToken(user.id, user.role);

    // Start a 7-day Plus trial so new caregivers experience the premium value.
    await this.billing.startTrialIfEligible(user.id);

    // Verification email (does not block registration).
    await this.mail.sendVerificationEmail(
      user.email,
      verifyToken.raw,
      user.firstName,
    );

    return { user, accessToken, refreshToken, sessionId: session.id };
  }

  async verifyEmail(token: string) {
    const hashed = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyToken: hashed,
        emailVerifyExpiresAt: { gt: new Date() },
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired verification link');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiresAt: null,
      },
    });
    await this.mail.sendWelcomeEmail(user.email, user.firstName);
    return { success: true };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) return { success: true };

    const verifyToken = this.makeToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyToken: verifyToken.hashed,
        emailVerifyExpiresAt: expiresAt,
      },
    });
    await this.mail.sendVerificationEmail(
      user.email,
      verifyToken.raw,
      user.firstName,
    );
    return { success: true };
  }

  /** Always returns success to avoid leaking whether an email is registered. */
  async forgotPassword(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (user) {
      const resetToken = this.makeToken();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken.hashed,
          passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      await this.mail.sendPasswordResetEmail(
        user.email,
        resetToken.raw,
        user.firstName,
      );
    }
    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const hashed = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashed,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired reset link');
    }
    const passwordHash = await this.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
    // Invalidate all existing sessions after a password reset.
    await this.prisma.userSession.deleteMany({ where: { userId: user.id } });
    return { success: true };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    let payload: { sub: string; sid: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    const matches = await this.verify(refreshToken, session.refreshTokenHash);
    if (!matches) {
      // Token reuse / theft - revoke the session.
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + REFRESH_TTL_DAYS);
    const newRefreshToken = await this.signRefreshToken(
      user.id,
      session.id,
      newExpiresAt,
    );
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: await this.hash(newRefreshToken),
        expiresAt: newExpiresAt,
      },
    });
    const accessToken = await this.signAccessToken(user.id, user.role);
    return { accessToken, refreshToken: newRefreshToken };
  }

  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        emailVerified: true,
        acceptedTermsAt: true,
        acceptedPrivacyAt: true,
        termsVersion: true,
        subscription: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const patients = await this.prisma.patientCaregiver.findMany({
      where: { caregiverId: userId },
      include: {
        patient: {
          include: {
            reminders: true,
            contacts: true,
            mmseTests: true,
            clockTests: true,
            treatments: true,
          },
        },
      },
    });

    const aiConversations = await this.prisma.aiConversation.findMany({
      where: { ownerId: userId },
      include: { messages: true },
    });

    return {
      exportedAt: new Date().toISOString(),
      account: user,
      patients: patients.map((pc) => ({ role: pc.role, ...pc.patient })),
      aiConversations,
    };
  }

  async deleteAccount(userId: string) {
    const owned = await this.prisma.patientCaregiver.findMany({
      where: { caregiverId: userId },
      select: { patientId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      for (const { patientId } of owned) {
        const others = await tx.patientCaregiver.count({
          where: { patientId, caregiverId: { not: userId } },
        });
        if (others === 0) {
          await tx.patient.delete({ where: { id: patientId } });
        }
      }
      await tx.user.delete({ where: { id: userId } });
    });

    return { success: true };
  }

  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !(await this.verify(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: '-',
        ip,
        userAgent,
        expiresAt,
      },
    });

    const refreshToken = await this.signRefreshToken(
      user.id,
      session.id,
      expiresAt,
    );
    const refreshTokenHash = await this.hash(refreshToken);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash },
    });

    const accessToken = await this.signAccessToken(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        workplace: user.workplace,
        profession: user.profession,
        title: user.title,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        workplace: true,
        profession: true,
        title: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone || null }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl || null }),
        ...(dto.workplace !== undefined && { workplace: dto.workplace || null }),
        ...(dto.profession !== undefined && { profession: dto.profession || null }),
        ...(dto.title !== undefined && { title: dto.title || null }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        workplace: true,
        profession: true,
        title: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private async signAccessToken(userId: string, role: string) {
    // Patient devices have no password/login of their own, so they should stay
    // signed in. Give patient access tokens a long life (the app also silently
    // re-authenticates with the trusted device id if one ever expires).
    const accessTtl =
      role === 'PATIENT'
        ? this.config.get<string>('JWT_PATIENT_ACCESS_TTL') || '180d'
        : this.config.get<string>('JWT_ACCESS_TTL') || DEFAULT_ACCESS_TTL;
    return this.jwt.signAsync(
      { sub: userId, role, type: 'access' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET')!,
        expiresIn: accessTtl,
      },
    );
  }

  private async signRefreshToken(
    userId: string,
    sessionId: string,
    expiresAt: Date,
  ) {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
        expiresIn: Math.floor((+expiresAt - Date.now()) / 1000),
      },
    );
  }

  async patientLogin(pairingCode: string, deviceInfo: DeviceInfo) {
    const pairing = await this.prisma.pairingCode.findFirst({
      where: {
        code: pairingCode.replace('-', ''),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            avatarUrl: true,
            shortIntro: true,
            maritalDate: true,
            createdAt: true,
          },
        },
      },
    });

    if (!pairing) {
      throw new UnauthorizedException('Invalid or expired pairing code');
    }

    let device = await this.prisma.device.findUnique({
      where: {
        patientId_devicePublicId: {
          patientId: pairing.patientId,
          devicePublicId: deviceInfo.deviceId,
        },
      },
    });

    if (!device) {
      device = await this.prisma.device.create({
        data: {
          patientId: pairing.patientId,
          platform: deviceInfo.platform,
          devicePublicId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName,
          isPrimary: false,
        },
      });
    }

    await this.prisma.pairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    const accessToken = await this.signAccessToken(
      pairing.patientId,
      'PATIENT',
    );
    const refreshToken = await this.signPatientRefreshToken(
      pairing.patientId,
      device.id,
    );

    return {
      patient: pairing.patient,
      accessToken,
      refreshToken,
      deviceId: device.id,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deviceLogin(deviceToken: string, _pinCode?: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceToken },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            avatarUrl: true,
            shortIntro: true,
            maritalDate: true,
            createdAt: true,
          },
        },
      },
    });

    if (!device) {
      throw new UnauthorizedException('Device not found or not authorized');
    }

    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    const accessToken = await this.signAccessToken(device.patientId, 'PATIENT');
    const refreshToken = await this.signPatientRefreshToken(
      device.patientId,
      device.id,
    );

    return {
      patient: device.patient,
      accessToken,
      refreshToken,
      deviceId: device.id,
    };
  }

  private async signPatientRefreshToken(patientId: string, deviceId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

    return this.jwt.signAsync(
      { sub: patientId, deviceId, type: 'patient_refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
        expiresIn: Math.floor((+expiresAt - Date.now()) / 1000),
      },
    );
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.userSession.deleteMany({
        where: {
          id: sessionId,
          userId,
        },
      });
    } else {
      await this.prisma.userSession.deleteMany({
        where: {
          userId,
        },
      });
    }

    return { success: true };
  }
}
