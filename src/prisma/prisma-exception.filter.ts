import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Surfaces Prisma error codes in API responses and logs the full error server-side.
 * Helps debug production 500s (e.g. missing migrations on Render) without guessing.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientUnknownRequestError
      | Prisma.PrismaClientValidationError
      | Prisma.PrismaClientInitializationError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message } = this.mapException(exception);
    this.logger.error(
      `${request.method} ${request.url} — [${code}] ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: Record<string, string | number> = {
      statusCode: status,
      message,
    };
    if (code) {
      body.code = code;
    }
    response.status(status).json(body);
  }

  private mapException(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientUnknownRequestError
      | Prisma.PrismaClientValidationError
      | Prisma.PrismaClientInitializationError,
  ): { status: number; code: string; message: string } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapKnownRequest(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION',
        message: 'Invalid query or data',
      };
    }
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'INIT',
        message:
          'Database is unavailable. Check DATABASE_URL and network access.',
      };
    }
    // PrismaClientUnknownRequestError
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'UNKNOWN',
      message:
        'A database request failed. See server logs for details; verify migrations are applied (prisma migrate deploy).',
    };
  }

  private mapKnownRequest(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
  } {
    const c = e.code;
    // https://www.prisma.io/docs/reference/api-reference/error-reference
    switch (c) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: c,
          message: 'A record with this value already exists.',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: c,
          message: 'Record not found.',
        };
      case 'P1000':
      case 'P1001':
      case 'P1002':
      case 'P1003':
      case 'P1010':
      case 'P1011':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          code: c,
          message:
            'Could not connect to the database. Check DATABASE_URL and that the instance is up.',
        };
      case 'P2010':
      case 'P2021': // table does not exist
      case 'P2022': // column does not exist
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: c,
          message:
            'Schema mismatch: run `npx prisma migrate deploy` against this database, then redeploy.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: c,
          message: e.message,
        };
    }
  }
}
