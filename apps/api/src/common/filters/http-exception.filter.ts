import type {
  ArgumentsHost,
  ExceptionFilter} from '@nestjs/common';
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException
      ? exception.getResponse()
      : { message: 'Erro interno do servidor' };

    if (!isHttpException) {
      // Only genuinely unexpected errors are reported — an HttpException
      // (400/403/404/etc.) is expected control flow (a rejected sale, a
      // failed login, bad input), not a bug to page anyone about. This call
      // is a safe no-op whenever Sentry was never initialized (no
      // SENTRY_DSN, or NODE_ENV=test) — see instrument.ts.
      this.logger.error(exception instanceof Error ? exception.stack : exception);
      Sentry.captureException(exception);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      ...(typeof body === 'string' ? { message: body } : body),
    });
  }
}
