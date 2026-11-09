import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { gameSlugSchema } from '../../games/dto/game.schemas.js';

export class SubscriptionDto extends createZodDto(z.strictObject({ slug: gameSlugSchema })) {}
