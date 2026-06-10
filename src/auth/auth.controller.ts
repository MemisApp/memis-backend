import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ua = req.headers['user-agent'] ?? '';
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;

    const { user, accessToken, refreshToken, sessionId } =
      await this.auth.register(dto, ip, ua);
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    // refreshToken is also returned for native clients (no browser cookie jar).
    return {
      user,
      accessToken,
      refreshToken,
      sessionId,
    };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'caregiver.demo@memis.dev' },
        password: { type: 'string', example: 'Memis123!' },
      },
      required: ['email', 'password'],
    },
  })
  @ApiOkResponse({
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        sessionId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ua = req.headers['user-agent'] ?? '';
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip;

    const { user, accessToken, refreshToken, sessionId } =
      await this.auth.login(body.email, body.password, ip, ua);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    // refreshToken is also returned for native clients (no browser cookie jar).
    return {
      user,
      accessToken,
      refreshToken,
      sessionId,
    };
  }

  @Post('patient-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Patient login with pairing code' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pairingCode: { type: 'string', example: 'ABCD1234' },
        deviceInfo: {
          type: 'object',
          properties: {
            platform: { type: 'string', example: 'ios' },
            deviceName: { type: 'string', example: 'iPhone 12' },
            deviceId: { type: 'string', example: 'device-unique-id' },
          },
          required: ['platform', 'deviceName', 'deviceId'],
        },
      },
      required: ['pairingCode', 'deviceInfo'],
    },
  })
  @ApiOkResponse({
    description: 'Patient login successful',
    schema: {
      type: 'object',
      properties: {
        patient: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            birthDate: { type: 'string', format: 'date-time', nullable: true },
            avatarUrl: { type: 'string', nullable: true },
            shortIntro: { type: 'string', nullable: true },
            maritalDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        deviceId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Invalid or expired pairing code' })
  async patientLogin(
    @Body()
    body: {
      pairingCode: string;
      deviceInfo: { platform: string; deviceName: string; deviceId: string };
    },
  ) {
    const { patient, accessToken, refreshToken, deviceId } =
      await this.auth.patientLogin(body.pairingCode, body.deviceInfo);

    return {
      patient,
      accessToken,
      refreshToken,
      deviceId,
    };
  }

  @Post('device-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Device login (subsequent logins)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        deviceToken: { type: 'string', example: 'device-id' },
        pinCode: { type: 'string', example: '1234' },
      },
      required: ['deviceToken'],
    },
  })
  @ApiOkResponse({
    description: 'Device login successful',
    schema: {
      type: 'object',
      properties: {
        patient: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            birthDate: { type: 'string', format: 'date-time', nullable: true },
            avatarUrl: { type: 'string', nullable: true },
            shortIntro: { type: 'string', nullable: true },
            maritalDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        deviceId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({
    status: 401,
    description: 'Device not found or not authorized',
  })
  async deviceLogin(@Body() body: { deviceToken: string; pinCode?: string }) {
    const { patient, accessToken, refreshToken, deviceId } =
      await this.auth.deviceLogin(body.deviceToken, body.pinCode);

    return {
      patient,
      accessToken,
      refreshToken,
      deviceId,
    };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout user (invalidate session)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description:
            'Optional session ID to logout specific session. If not provided, logs out all sessions for the user.',
          example: 'session-id-123',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Logout successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @Body() body: { sessionId?: string },
    @Req() req: Request & { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const result = await this.auth.logout(userId, body?.sessionId);

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/refresh',
    });

    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current caregiver profile' })
  @ApiOkResponse({ description: 'Profile retrieved successfully' })
  async getMe(@Req() req: Request & { user: { id: string } }) {
    return this.auth.getMe(req.user.id);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update current caregiver profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ description: 'Profile updated successfully' })
  async updateMe(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updateMe(req.user.id, dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Exchange refresh token (cookie or body) for a new access token' })
  async refresh(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Web clients send the httpOnly cookie; native clients send it in the body.
    const token = req.cookies?.['refresh_token'] || body?.refreshToken;
    const { accessToken, refreshToken } = await this.auth.refresh(token ?? '');
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
    // Also return the rotated token for native clients.
    return { accessToken, refreshToken };
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify email address with token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Resend the email verification link' })
  async resendVerification(@Req() req: Request & { user: { id: string } }) {
    return this.auth.resendVerification(req.user.id);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Reset password using a token' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('me/data-export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'GDPR: export all personal data for current user' })
  async exportData(@Req() req: Request & { user: { id: string } }) {
    return this.auth.exportUserData(req.user.id);
  }

  @Delete('me/account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'GDPR: permanently delete current user account' })
  async deleteAccount(
    @Req() req: Request & { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.deleteAccount(req.user.id);
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/refresh',
    });
    return result;
  }
}
