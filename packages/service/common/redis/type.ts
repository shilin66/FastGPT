import type Redis from 'ioredis';
import type { Cluster } from 'ioredis';
export type RedisConnection = Redis | Cluster;
declare global {
  var redisClient: RedisConnection | null;
}
