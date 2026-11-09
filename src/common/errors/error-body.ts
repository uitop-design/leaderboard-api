import { HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client.js';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

interface ResolvedError {
  statusCode: number;
  message: string | string[];
}

const prismaErrors: Record<string, ResolvedError> = {
  P2002: { statusCode: HttpStatus.CONFLICT, message: 'Resource already exists' },
  P2025: { statusCode: HttpStatus.NOT_FOUND, message: 'Resource not found' },
  P2003: { statusCode: HttpStatus.BAD_REQUEST, message: 'Related resource does not exist' },
};

const internalError: ResolvedError = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  message: 'Internal server error',
};

export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof HttpException) {
    return { statusCode: exception.getStatus(), message: extractMessage(exception) };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return prismaErrors[exception.code] ?? internalError;
  }
  return internalError;
}

export function buildErrorBody(exception: unknown, path: string): ErrorBody {
  const { statusCode, message } = resolveError(exception);
  return {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
    path,
    timestamp: new Date().toISOString(),
  };
}

function extractMessage(exception: HttpException): string | string[] {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && 'message' in response) {
    const { message } = response;
    if (typeof message === 'string' || isStringArray(message)) {
      return message;
    }
  }
  return exception.message;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
