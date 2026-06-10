import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import { Request, Response } from 'express';
import { json, urlencoded } from 'express';

/**
 * Builds the CORS origin validator. In production we restrict to an allowlist
 * from CORS_ORIGINS; if none is configured (e.g. local dev) we allow all.
 */
function buildCorsOptions() {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return { origin: true, credentials: true };
  }
  const allowlist = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return {
    credentials: true,
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow same-origin / non-browser requests (no Origin header).
      if (!origin || allowlist.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
  };
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      cors: buildCorsOptions(),
      logger: ['error', 'warn', 'log'],
      // Keep the raw body available so Stripe webhook signatures can be verified.
      rawBody: true,
    });
    // Security headers. crossOriginResourcePolicy disabled so images/data URLs
    // served to the mobile app are not blocked.
    app.use(
      helmet({
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: false,
      }),
    );
    app.use(json({ limit: '2mb' }));
    app.use(urlencoded({ limit: '2mb', extended: true }));
    app.use(cookieParser());

    app.useGlobalFilters(new PrismaExceptionFilter());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        disableErrorMessages: false,
      }),
    );

    app.use('/', (req: Request, res: Response, next: () => void) => {
      if (req.path === '/') {
        res.redirect('/health');
      } else {
        next();
      }
    });

    const config = new DocumentBuilder()
      .setTitle('Memis API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);

    const prismaService = app.get(PrismaService);
    prismaService.enableShutdownHooks(app);

    const port = process.env.PORT || 3000;
    await app.listen(port, '0.0.0.0');
    logger.log(`Application is running on: http://0.0.0.0:${port}`);
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}
void bootstrap();
