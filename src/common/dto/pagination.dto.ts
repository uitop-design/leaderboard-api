import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
