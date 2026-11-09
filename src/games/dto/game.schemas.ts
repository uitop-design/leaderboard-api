import { z } from 'zod';

export const gameSlugSchema = z
  .string()
  .regex(/^[a-z0-9-]{3,32}$/, 'must be 3-32 characters: lowercase letters, digits or hyphens')
  .describe('Unique game identifier used in URLs');

export const gameNameSchema = z.string().trim().min(2).max(64).describe('Display name');

export const gameSchema = z.object({
  id: z.uuid(),
  slug: gameSlugSchema,
  name: gameNameSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const gameListItemSchema = gameSchema.extend({
  playersCount: z.int().min(0),
});

export const gameListSchema = z.object({
  items: z.array(gameListItemSchema),
  total: z.int().min(0),
  page: z.int().min(1),
  limit: z.int().min(1),
});

export const gameDetailsSchema = gameSchema.extend({
  playersCount: z.int().min(0),
  scoresCount: z.int().min(0),
  topScore: z.int().min(0).nullable(),
});
