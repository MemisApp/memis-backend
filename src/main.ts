import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { Request, Response } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      cors: { origin: true, credentials: true },
      logger: ['error', 'warn', 'log'],
    });
    app.use(cookieParser());

    // Enable global validation with security-focused options
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // Strip properties that don't have validation decorators
        forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are found
        transform: true, // Automatically transform payloads to DTO instances
        disableErrorMessages: false, // Keep error messages for development
      }),
    );

    // Redirect root URL to health endpoint
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

    // Enable Prisma shutdown hooks
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
