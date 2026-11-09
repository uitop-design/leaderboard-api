import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

const CHECK_TIMEOUT_MS = 2000;

export type DependencyStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok';
  checks: { postgres: DependencyStatus; redis: DependencyStatus };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [postgres, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`.then(() => true)),
      probe(() => this.redis.ping()),
    ]);
    const checks = { postgres, redis };
    const down = Object.entries(checks)
      .filter(([, status]) => status === 'down')
      .map(([name]) => name);
    if (down.length > 0) {
      throw new ServiceUnavailableException(`Unavailable dependencies: ${down.join(', ')}`);
    }
    return { status: 'ok', checks };
  }
}

async function probe(check: () => Promise<boolean>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return (await Promise.race([check(), timeout])) ? 'up' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
