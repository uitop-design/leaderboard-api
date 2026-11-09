# Leaderboard API

Backend for game leaderboards with live updates. Games collect scores from players, rankings are
served from Redis sorted sets backed by PostgreSQL, and subscribers receive the new top 10 over
WebSocket whenever it changes.

There is no frontend: the API is documented with Swagger, and WebSocket events are described below.

## Stack

- Node.js 24 LTS, TypeScript (strict), NestJS 12 (ESM)
- PostgreSQL 18 with Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg` driver adapter)
- Redis 8 via ioredis — sorted sets for rankings
- Socket.IO via `@nestjs/websockets` and `@nestjs/platform-socket.io`
- Zod 4 with `nestjs-zod` — request validation and OpenAPI schemas from the same source
- `@nestjs/config` with a zod-validated environment
- Jest (ts-jest, ESM), oxlint, Prettier
- Docker multi-stage image and Docker Compose

## Data model

| Game        | Type        | Notes       |
| ----------- | ----------- | ----------- |
| `id`        | uuid        | primary key |
| `slug`      | varchar(32) | unique      |
| `name`      | varchar(64) |             |
| `createdAt` | timestamptz |             |
| `updatedAt` | timestamptz |             |

| Score        | Type        | Notes                                 |
| ------------ | ----------- | ------------------------------------- |
| `id`         | uuid        | primary key                           |
| `gameId`     | uuid        | foreign key to `Game`, cascade delete |
| `playerName` | varchar(32) | stored as submitted                   |
| `value`      | integer     |                                       |
| `createdAt`  | timestamptz |                                       |

Scores are indexed by `(gameId, value DESC)`.

## Business rules

- `slug`: `[a-z0-9-]`, 3–32 characters, unique — a taken slug returns `409`.
- `name`: 2–64 characters after trimming.
- `playerName`: `[A-Za-z0-9_-]`, 2–32 characters. The case is preserved for display, but players
  are matched case-insensitively: `Nova` and `nova` are the same player.
- `value`: integer from `0` to `1 000 000 000`; higher is better.
- A leaderboard contains the best score of each player.
- Ranks are competition ranks: equal scores share a rank and the next rank is skipped
  (`1, 2, 2, 4`). Within a shared rank the player who reached the score first is listed first.
- A player is displayed with the name spelling used for their best score.
- A score is a personal best when it is strictly higher than every earlier score of that player.
- Unknown games return `404`. Request bodies reject unknown fields.

## REST API

All endpoints are prefixed with `/api`. Interactive documentation is available at
[`http://localhost:3300/docs`](http://localhost:3300/docs) (OpenAPI JSON at `/docs-json`).

| Method | Path                                   | Description                                          |
| ------ | -------------------------------------- | ---------------------------------------------------- |
| POST   | `/api/games`                           | Create a game `{ slug, name }` → `201`               |
| GET    | `/api/games?page=&limit=`              | Games, newest first, with `playersCount`             |
| GET    | `/api/games/:slug`                     | Game with `playersCount`, `scoresCount`, `topScore`  |
| DELETE | `/api/games/:slug`                     | Delete a game, its scores and its Redis keys → `204` |
| POST   | `/api/games/:slug/scores`              | Submit `{ playerName, value }` → `201`               |
| GET    | `/api/games/:slug/leaderboard?limit=`  | Top players `[{ rank, playerName, score }]`          |
| GET    | `/api/games/:slug/players/:playerName` | `{ playerName, best, rank, scoresCount }`            |
| GET    | `/api/health`                          | Postgres and Redis status, `503` when one is down    |

Pagination: `page` defaults to `1` (max `1 000 000`), `limit` defaults to `20` (max `100`). The
response is `{ items, total, page, limit }`. The leaderboard `limit` defaults to `10` (max `100`).

Submitting a score returns:

```json
{
  "score": { "id": "…", "playerName": "nova", "value": 101300, "createdAt": "…" },
  "best": 101300,
  "rank": 1,
  "isPersonalBest": true
}
```

### Errors

Every error, including WebSocket acknowledgements, uses the same body:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Game \"unknown\" not found",
  "path": "/api/games/unknown",
  "timestamp": "2026-11-09T12:00:00.000Z"
}
```

- Validation errors return `400` with `message` as a list of `field: problem` strings.
- Prisma errors are mapped: unique violation `P2002` → `409`, record not found `P2025` → `404`,
  foreign key violation `P2003` → `400`.
- Anything unexpected returns `500` with a generic message; details are only logged.

## WebSocket

Socket.IO namespace: `/leaderboards` (same port as HTTP).

| Direction       | Event         | Payload                 | Acknowledgement                                           |
| --------------- | ------------- | ----------------------- | --------------------------------------------------------- |
| client → server | `subscribe`   | `{ slug }`              | `{ ok: true, slug, leaderboard }` with the current top 10 |
| client → server | `unsubscribe` | `{ slug }`              | `{ ok: true, slug }`                                      |
| server → client | `leaderboard` | `{ slug, leaderboard }` | —                                                         |

- An invalid or unknown slug is acknowledged with `{ ok: false, error }`, where `error` has the
  same shape as an HTTP error body (`400` or `404`).
- `subscribe` joins the room of the game; `unsubscribe` leaves it.
- After a score is submitted, the server emits `leaderboard` with the new top 10 to the game room
  when the score is a personal best that places the player in the top 10.

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3300/leaderboards');
socket.on('leaderboard', ({ slug, leaderboard }) => console.log(slug, leaderboard));
const ack = await socket.emitWithAck('subscribe', { slug: 'space-runner' });
```

## How ranking works

PostgreSQL is the source of truth: every submitted score is stored there first. Redis holds a
ranking per game, built from the best score of each player:

- `leaderboard:{gameId}:scores` — sorted set, member is the lower-cased player name, score is the
  player's best value.
- `leaderboard:{gameId}:players` — hash with the display name and the time the best score was
  reached, used for display and tie ordering.

A Lua script updates both keys atomically with `ZADD GT`, so concurrent submissions of the same
player always leave the maximum in the ranking. Ranks are computed as one plus the number of
players with a strictly higher score; the top list is read with all players tied at the cut-off and
ordered by the time the score was reached.

When the keys of a game are missing (first read, eviction, manual deletion, Redis restart), they
are rebuilt from PostgreSQL with the same script. If Redis is unavailable, leaderboards and ranks
are computed in PostgreSQL with the same rules, submissions keep working, and `/api/health`
returns `503`. When the connection is restored, all leaderboard keys are dropped and rebuilt lazily,
so scores written during the outage are not lost from the ranking.

## Running with Docker Compose

```bash
docker compose up -d --build
```

| Service    | Host port | Description                                       |
| ---------- | --------- | ------------------------------------------------- |
| `app`      | 3300      | API, Swagger at `/docs`, WebSocket                |
| `postgres` | 5436      | PostgreSQL 18                                     |
| `redis`    | 6382      | Redis 8                                           |
| `migrate`  | —         | One-off job: `prisma migrate deploy` and the seed |

The seed is idempotent and creates `space-runner`, `block-puzzle` and `retro-racer` (with ties in
their top scores) and an empty `empty-arena`. To start from a clean database run
`docker compose down -v`.

## Running locally

Requirements: Node.js 22+ and running PostgreSQL and Redis (for example
`docker compose up -d postgres redis`).

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run start:dev
```

| Variable       | Example                                                           |
| -------------- | ----------------------------------------------------------------- |
| `NODE_ENV`     | `development`                                                     |
| `PORT`         | `3300`                                                            |
| `DATABASE_URL` | `postgresql://leaderboard:leaderboard@localhost:5436/leaderboard` |
| `REDIS_URL`    | `redis://localhost:6382`                                          |

The environment is validated at startup; the application refuses to start with a missing or
malformed variable. Prisma commands read `.env` through `prisma.config.ts`.

## Scripts

| Command              | Description                            |
| -------------------- | -------------------------------------- |
| `npm run build`      | Generate the Prisma client and compile |
| `npm run start:dev`  | Start in watch mode                    |
| `npm test`           | Unit tests                             |
| `npm run test:cov`   | Unit tests with coverage               |
| `npm run lint`       | oxlint and Prettier check              |
| `npm run format`     | Format with Prettier                   |
| `npm run typecheck`  | Type-check without emitting            |
| `npm run db:migrate` | Apply migrations                       |
| `npm run db:seed`    | Seed demo data                         |

Unit tests mock Prisma, Redis and the Socket.IO server, so they do not need running services.
