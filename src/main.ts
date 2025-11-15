import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: { origin: true, credentials: true },
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
  app.use('/', (req: any, res: any, next: () => void) => {
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

  await app.listen(3000, '0.0.0.0');
}
void bootstrap();
