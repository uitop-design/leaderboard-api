import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

interface SeedGame {
  slug: string;
  name: string;
  scores: [playerName: string, value: number][];
}

const games: SeedGame[] = [
  {
    slug: 'space-runner',
    name: 'Space Runner',
    scores: [
      ['Nova', 98_200],
      ['orbit_rider', 87_450],
      ['Comet-7', 87_450],
      ['nova', 101_300],
      ['Quasar', 65_000],
      ['meteor', 54_900],
      ['Pulsar', 54_900],
      ['Eclipse', 54_900],
      ['Zenith', 41_250],
      ['Orbit_Rider', 12_000],
      ['Vega', 33_700],
      ['Lyra', 29_800],
      ['Sirius', 18_400],
    ],
  },
  {
    slug: 'block-puzzle',
    name: 'Block Puzzle',
    scores: [
      ['TetraQueen', 4_200],
      ['cube_master', 4_200],
      ['Stacker', 3_150],
      ['tetraqueen', 3_900],
      ['LineClear', 2_700],
      ['stacker', 3_800],
    ],
  },
  {
    slug: 'retro-racer',
    name: 'Retro Racer',
    scores: [
      ['Drift-King', 312],
      ['apex', 298],
      ['Turbo_Tom', 298],
      ['Nitro', 275],
    ],
  },
  {
    slug: 'empty-arena',
    name: 'Empty Arena',
    scores: [],
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedGame({ slug, name, scores }: SeedGame, startedAt: number): Promise<void> {
  const game = await prisma.game.upsert({ where: { slug }, update: {}, create: { slug, name } });
  if ((await prisma.score.count({ where: { gameId: game.id } })) > 0) {
    return;
  }
  await prisma.score.createMany({
    data: scores.map(([playerName, value], index) => ({
      gameId: game.id,
      playerName,
      value,
      createdAt: new Date(startedAt + index * 60_000),
    })),
  });
}

async function main(): Promise<void> {
  const startedAt = Date.now() - 24 * 60 * 60 * 1000;
  for (const game of games) {
    await seedGame(game, startedAt);
  }
  process.stdout.write(`Seeded ${games.length} games\n`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
