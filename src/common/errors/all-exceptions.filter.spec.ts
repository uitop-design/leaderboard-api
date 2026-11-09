import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ZodError, z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { formatZodError } from '../validation/zod-validation.pipe.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import type { ErrorBody } from './error-body.js';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

function httpHost(url: string) {
  const json = jest.fn<(body: ErrorBody) => void>();
  const status = jest.fn((_code: number) => ({ json }));
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logError: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  function respond(exception: unknown, url = '/api/games') {
    const { host, status, json } = httpHost(url);
    filter.catch(exception, host);
    const body = json.mock.calls[0]?.[0];
    if (!body) {
      throw new Error('No response body was sent');
    }
    return { status: status.mock.calls[0]?.[0], body };
  }

  it('renders HTTP exceptions in the unified format', () => {
    const { status, body } = respond(new NotFoundException('Game "x" not found'), '/api/games/x');

    expect(status).toBe(404);
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Game "x" not found',
      path: '/api/games/x',
      timestamp: expect.any(String),
    });
  });

  it('returns validation errors as a list of messages', () => {
    const result = z.object({ slug: z.string(), value: z.int() }).safeParse({ value: 'x' });
    const messages = formatZodError(result.error);

    const { status, body } = respond(new BadRequestException(messages));

    expect(status).toBe(400);
    expect(body.message).toEqual([
      'slug: Invalid input: expected string, received undefined',
      'value: Invalid input: expected number, received string',
    ]);
    expect(formatZodError(new Error('other'))).toEqual(['Validation failed']);
    expect(result.error).toBeInstanceOf(ZodError);
  });

  it.each([
    ['P2002', 409, 'Conflict'],
    ['P2025', 404, 'Not Found'],
    ['P2003', 400, 'Bad Request'],
  ])('maps Prisma %s to %i', (code, statusCode, error) => {
    const { status, body } = respond(prismaError(code));

    expect(status).toBe(statusCode);
    expect(body).toMatchObject({ statusCode, error });
    expect(body.message).not.toContain('Prisma');
  });

  it('hides details of unexpected errors and logs them', () => {
    const { status, body } = respond(new Error('password=secret at db.internal:5432'));

    expect(status).toBe(500);
    expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(logError).toHaveBeenCalled();
  });

  it('treats unknown Prisma codes as unexpected errors', () => {
    expect(respond(prismaError('P1001')).status).toBe(500);
  });

  it('does not log expected HTTP errors', () => {
    respond(new ConflictException());

    expect(logError).not.toHaveBeenCalled();
  });

  it('acknowledges WebSocket errors with the same body', () => {
    const ack = jest.fn();
    const client = { nsp: { name: '/leaderboards' } };
    const host = {
      getType: () => 'ws',
      switchToWs: () => ({ getClient: () => client }),
      getArgs: () => [client, { slug: 'missing' }, ack, 'subscribe'],
    } as unknown as ArgumentsHost;

    filter.catch(new NotFoundException('Game "missing" not found'), host);

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: {
        statusCode: 404,
        error: 'Not Found',
        message: 'Game "missing" not found',
        path: '/leaderboards/subscribe',
        timestamp: expect.any(String),
      },
    });
  });
});
