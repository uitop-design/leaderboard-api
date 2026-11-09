import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const dependencyStatusSchema = z.enum(['up', 'down']);

export class HealthDto extends createZodDto(
  z.object({
    status: z.literal('ok'),
    checks: z.object({ postgres: dependencyStatusSchema, redis: dependencyStatusSchema }),
  }),
) {}
