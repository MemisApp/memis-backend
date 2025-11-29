import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
