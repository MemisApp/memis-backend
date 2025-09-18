import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private async hash(data: string) {
    return bcrypt.hash(data, 12);
  }

  private async verify(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }

  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists)
      throw new ConflictException(
        'Vartotojas su tokiu el. paštu jau egzistuoja',
      );

    const passwordHash = await this.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'CAREGIVER',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
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

    return { user, accessToken, refreshToken, sessionId: session.id };
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
        role: user.role,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  private async signAccessToken(userId: string, role: string) {
    return this.jwt.signAsync(
      { sub: userId, role, type: 'access' },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET')!,
        expiresIn: ACCESS_TTL,
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

  async patientLogin(pairingCode: string, deviceInfo: any) {
    // Find valid pairing code
    const pairing = await this.prisma.pairingCode.findFirst({
      where: {
        code: pairingCode.replace('-', ''), // Remove dash if provided
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

    // Check if device already exists for this patient
    let device = await this.prisma.device.findUnique({
      where: {
        patientId_devicePublicId: {
          patientId: pairing.patientId,
          devicePublicId: deviceInfo.deviceId,
        },
      },
    });

    if (!device) {
      // Create new device
      device = await this.prisma.device.create({
        data: {
          patientId: pairing.patientId,
          platform: deviceInfo.platform,
          devicePublicId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName,
          isPrimary: false, // User can set primary later
        },
      });
    }

    // Mark pairing code as used
    await this.prisma.pairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: new Date() },
    });

    // Update device last seen
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    // Generate tokens for patient
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

  async deviceLogin(deviceToken: string, pinCode?: string) {
    // For now, we'll use deviceToken as deviceId (simplified)
    // In production, you'd want to implement proper device tokens
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

    // Update last seen
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    // Generate tokens
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
}
