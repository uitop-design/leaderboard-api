import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { STATUS_CODES } from 'node:http';
import { ErrorDto } from '../dto/error.dto.js';

export function ApiErrorResponses(...statuses: HttpStatus[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: STATUS_CODES[status], type: ErrorDto }),
    ),
  );
}
