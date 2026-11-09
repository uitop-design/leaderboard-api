import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Socket } from 'socket.io';
import { buildErrorBody, ErrorBody } from './error-body.js';

type Ack = (response: { ok: false; error: ErrorBody }) => void;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'ws') {
      this.handleWs(exception, host);
      return;
    }
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const body = this.build(exception, request.originalUrl);
    http.getResponse<Response>().status(body.statusCode).json(body);
  }

  private handleWs(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    const [, , ack, pattern] = host.getArgs<[Socket, unknown, unknown, unknown]>();
    const body = this.build(exception, `${client.nsp.name}/${String(pattern)}`);
    if (typeof ack === 'function') {
      (ack as Ack)({ ok: false, error: body });
    }
  }

  private build(exception: unknown, path: string): ErrorBody {
    const body = buildErrorBody(exception, path);
    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled error on ${path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    return body;
  }
}
