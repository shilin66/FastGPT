import { addLog } from '../system/log';
import Redis from 'ioredis';
import { RedisOptions } from 'ioredis/built/redis/RedisOptions';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const newQueueRedisConnection = () => {
  const redis = createRedisConnection();
  redis.on('connect', () => {
    console.log('Redis connected');
  });
  redis.on('error', (error) => {
    console.error('Redis connection error', error);
  });
  return redis;
};

export const newWorkerRedisConnection = () => {
  const redis = createRedisConnection({
    maxRetriesPerRequest: null
  });
  redis.on('connect', () => {
    console.log('Redis connected');
  });
  redis.on('error', (error) => {
    console.error('Redis connection error', error);
  });
  return redis;
};

export const getGlobalRedisCacheConnection = () => {
  if (global.redisCache) return global.redisCache;

  global.redisCache = createRedisConnection({ keyPrefix: 'fastgpt:cache:' });

  global.redisCache.on('connect', () => {
    addLog.info('Redis connected');
  });
  global.redisCache.on('error', (error) => {
    addLog.error('Redis connection error', error);
  });

  return global.redisCache;
};

const createRedisConnection = (options?: RedisOptions) => {
  if (process.env.REDIS_URL) {
    return new Redis(REDIS_URL);
  }

  const sentinelNodesStr = process.env.REDIS_SENTINEL_NODES ?? 'localhost:26379';
  const sentinelNodes = sentinelNodesStr.split(',').map((item) => {
    const [host, portStr] = item.split(':');
    const port = parseInt(portStr, 10);
    if (!host || isNaN(port)) {
      throw new Error(`Invalid sentinel node address: ${item}`);
    }
    return { host, port };
  });
  return new Redis({
    sentinels: sentinelNodes, // Sentinel 节点列表
    name: process.env.REDIS_MASTER_NAME, // 主节点组名

    sentinelUsername: process.env.REDIS_SENTINEL_USERNAME,
    sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,

    // 主/从节点 ACL 用户名/密码
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    ...options
  });
};
