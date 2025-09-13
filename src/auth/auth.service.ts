import { ConflictException, Injectable } from '@nestjs/common';
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
}
