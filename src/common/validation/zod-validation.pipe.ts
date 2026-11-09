import { BadRequestException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';

export function formatZodError(error: unknown): string[] {
  if (!(error instanceof ZodError)) {
    return ['Validation failed'];
  }
  return error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );
}

export const AppValidationPipe = createZodValidationPipe({
  createValidationException: (error) => new BadRequestException(formatZodError(error)),
  strictSchemaDeclaration: true,
});
