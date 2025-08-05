import { addLog } from '../system/log';
import Redis, { Cluster } from 'ioredis';
import type { RedisOptions } from 'ioredis/built/redis/RedisOptions';

// 类型定义
type RedisConnection = Redis | Cluster;
type RedisMode = 'single' | 'cluster' | 'sentinel';

// 全局类型声明
declare global {
  var redisClient: RedisConnection | null;
}

// 配置常量
const DEFAULT_CONFIG = {
  REDIS_URL: 'redis://localhost:6379',
  CLUSTER_NODES: 'localhost:6379',
  SENTINEL_NODES: 'localhost:26379',
  DB: 0,
  CONNECT_TIMEOUT: 10000,
  COMMAND_TIMEOUT: 5000,
  MAX_RETRIES: 3,
  RETRY_DELAY_FAILOVER: 100,
  RETRY_DELAY_CLUSTER_DOWN: 300
};

// 工具函数：添加事件监听器
const addEventListeners = (redis: RedisConnection, useConsole = true) => {
  if (redis instanceof Cluster) {
    redis.on('connect', () => {
      const message = 'Redis Cluster connected';
      useConsole ? console.log(message) : addLog.info(message);
    });

    redis.on('error', (error: Error) => {
      const message = 'Redis Cluster connection error';
      useConsole ? console.error(message, error) : addLog.error(message, error);
    });
  } else {
    redis.on('connect', () => {
      const message = 'Redis connected';
      useConsole ? console.log(message) : addLog.info(message);
    });

    redis.on('error', (error: Error) => {
      const message = 'Redis connection error';
      useConsole ? console.error(message, error) : addLog.error(message, error);
    });
  }
};

export const newQueueRedisConnection = () => {
  const redis = createRedisConnection();
  addEventListeners(redis, true);
  return redis;
};

export const newWorkerRedisConnection = () => {
  const redis = createRedisConnection({
    maxRetriesPerRequest: null
  });
  addEventListeners(redis, true);
  return redis;
};

export const FASTGPT_REDIS_PREFIX = 'fastgpt:';

export const getGlobalRedisConnection = (): RedisConnection => {
  if (global.redisClient) return global.redisClient;

  global.redisClient = createRedisConnection({ keyPrefix: FASTGPT_REDIS_PREFIX });
  addEventListeners(global.redisClient, false);

  return global.redisClient;
};

export const getAllKeysByPrefix = async (key: string): Promise<string[]> => {
  const redis = getGlobalRedisConnection();
  const pattern = `${FASTGPT_REDIS_PREFIX}${key}:*`;

  try {
    if (redis instanceof Cluster) {
      // Cluster 模式：从所有 master 节点获取 keys
      const nodes = redis.nodes('master');
      const keyPromises = nodes.map(async (node) => {
        try {
          return await node.keys(pattern);
        } catch (error) {
          addLog.error('Error getting keys from cluster node', error);
          return [];
        }
      });

      const allKeysArrays = await Promise.all(keyPromises);
      const allKeys = allKeysArrays.flat();

      // 去重并移除前缀
      return [...new Set(allKeys)].map((key) => key.replace(FASTGPT_REDIS_PREFIX, ''));
    }

    // 单机和 Sentinel 模式
    const keys = await redis.keys(pattern);
    return keys.map((key) => key.replace(FASTGPT_REDIS_PREFIX, ''));
  } catch (error) {
    addLog.error('Error getting keys by prefix', error);
    return [];
  }
};

// 工具函数：解析节点地址
const parseNodes = (nodesStr: string, defaultNodes: string) => {
  return (nodesStr || defaultNodes).split(',').map((item) => {
    const [host, portStr] = item.trim().split(':');
    const port = parseInt(portStr, 10);
    if (!host || isNaN(port)) {
      throw new Error(`Invalid node address: ${item}`);
    }
    return { host, port };
  });
};

// 工具函数：获取 Redis 模式
const getRedisMode = (): RedisMode => {
  if (process.env.REDIS_URL) return 'single';
  if (process.env.REDIS_MODE === 'cluster') return 'cluster';
  return 'sentinel';
};

// 工具函数：获取通用 Redis 配置
const getCommonRedisOptions = (options?: RedisOptions) => ({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  connectTimeout: Number(process.env.CONNECT_TIMEOUT ?? '') || DEFAULT_CONFIG.CONNECT_TIMEOUT,
  commandTimeout: Number(process.env.COMMAND_TIMEOUT ?? '') || DEFAULT_CONFIG.COMMAND_TIMEOUT,
  ...options
});

const createRedisConnection = (options?: RedisOptions): RedisConnection => {
  const mode = getRedisMode();

  switch (mode) {
    case 'single':
      return new Redis(process.env.REDIS_URL || DEFAULT_CONFIG.REDIS_URL, {
        ...getCommonRedisOptions(options),
        db: parseInt(process.env.REDIS_DB ?? String(DEFAULT_CONFIG.DB), 10)
      });

    case 'cluster': {
      const clusterNodes = parseNodes(
        process.env.REDIS_CLUSTER_NODES || '',
        DEFAULT_CONFIG.CLUSTER_NODES
      );

      return new Cluster(clusterNodes, {
        scaleReads: (process.env.REDIS_SCALE_READS as any) || 'master',
        enableReadyCheck: false,
        retryDelayOnFailover: DEFAULT_CONFIG.RETRY_DELAY_FAILOVER,
        retryDelayOnClusterDown: DEFAULT_CONFIG.RETRY_DELAY_CLUSTER_DOWN,
        lazyConnect: true,
        redisOptions: {
          ...getCommonRedisOptions(options),
          maxRetriesPerRequest: DEFAULT_CONFIG.MAX_RETRIES
        }
      });
    }

    case 'sentinel': {
      const sentinelNodes = parseNodes(
        process.env.REDIS_SENTINEL_NODES || '',
        DEFAULT_CONFIG.SENTINEL_NODES
      );

      return new Redis({
        sentinels: sentinelNodes,
        name: process.env.REDIS_MASTER_NAME,
        sentinelUsername: process.env.REDIS_SENTINEL_USERNAME,
        sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
        ...getCommonRedisOptions(options),
        db: parseInt(process.env.REDIS_DB ?? String(DEFAULT_CONFIG.DB), 10)
      });
    }

    default:
      throw new Error(`Unsupported Redis mode: ${mode}`);
  }
};
