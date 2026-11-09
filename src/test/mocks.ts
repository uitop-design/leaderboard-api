import { jest } from '@jest/globals';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';

export type AsyncMock<T> = jest.Mock<(...args: unknown[]) => Promise<T>>;

export function asyncFn<T>(): AsyncMock<T> {
  return jest.fn<(...args: unknown[]) => Promise<T>>();
}

export function createPrismaMock() {
  const mock = {
    game: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    score: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return { mock, service: mock as unknown as PrismaService };
}

export function createRedisMock(ready = true) {
  const pipeline = {
    eval: jest.fn(),
    exec: asyncFn<[Error | null, unknown][]>(),
  };
  const client = {
    exists: asyncFn<number>(),
    eval: asyncFn<number>(),
    zrevrange: asyncFn<string[]>(),
    zrange: asyncFn<string[]>(),
    hmget: asyncFn<(string | null)[]>(),
    zcount: asyncFn<number>(),
    unlink: asyncFn<number>(),
    pipeline: jest.fn(() => pipeline),
  };
  const mock = { client, pipeline, isReady: ready, onRecovery: jest.fn() };
  return { mock, service: mock as unknown as RedisService };
}

export function meta(name: string, at: number): string {
  return JSON.stringify({ name, at });
}
