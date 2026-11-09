import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const errorSchema = z.object({
  statusCode: z.int(),
  error: z.string(),
  message: z.union([z.string(), z.array(z.string())]),
  path: z.string(),
  timestamp: z.iso.datetime(),
});

export class ErrorDto extends createZodDto(errorSchema) {}
