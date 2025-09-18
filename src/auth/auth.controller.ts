import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import type { Request, Response } from 'express';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiResponse,
} from '@nestjs/swagger';

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

    return {
      user,
      accessToken,
      // refreshToken,
      sessionId,
    };
  }

  @Post('login')
  @HttpCode(200)
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

    return {
      user,
      accessToken,
      // refreshToken,
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
  async patientLogin(@Body() body: { pairingCode: string; deviceInfo: any }) {
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
}
