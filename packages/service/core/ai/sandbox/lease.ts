import { randomUUID } from 'node:crypto';
import { getGlobalRedisConnection } from '../../../common/redis';
import { getLogger, LogCategories } from '../../../common/logger';

const leaseTtlMs = 30_000;
const renewScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0`;
const releaseScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export class SandboxOperationConflict extends Error {
  readonly code = 'operation_conflict';

  constructor(message = 'Sandbox lifecycle operation no longer owns the resource') {
    super(`operation_conflict: ${message}`);
  }
}

export type SandboxLease = {
  token: string;
  isActive: () => boolean;
  assertOwned: () => Promise<void>;
  setHeartbeat: (heartbeat?: () => Promise<boolean>) => void;
};

export const withSandboxLease = async <T>(
  key: string,
  run: (lease: SandboxLease) => Promise<T>
): Promise<T> => {
  const redis = getGlobalRedisConnection();
  const token = randomUUID();
  if ((await redis.set(key, token, 'PX', leaseTtlMs, 'NX')) !== 'OK') {
    throw new SandboxOperationConflict();
  }

  let lost = false;
  let active = true;
  let renewal: Promise<void> | undefined;
  let heartbeat: (() => Promise<boolean>) | undefined;
  let heartbeatTask: Promise<void> | undefined;
  const assertOwned = async () => {
    if (lost || !active) throw new SandboxOperationConflict();
    try {
      const renewed = await redis.eval(renewScript, 1, key, token, leaseTtlMs);
      if (renewed !== 1) throw new SandboxOperationConflict();
    } catch (error) {
      lost = true;
      throw error;
    }
  };
  const timer = setInterval(() => {
    if (renewal || lost || !active) return;
    renewal = assertOwned()
      .then(() => {
        if (!active || lost || heartbeatTask || !heartbeat) return;
        const callback = heartbeat;
        heartbeatTask = (async () => {
          if (!(await callback()) && heartbeat === callback) heartbeat = undefined;
        })()
          .catch(() => {
            if (heartbeat === callback) heartbeat = undefined;
            logger.warn('Failed to update Sandbox operation heartbeat; observation stopped', {
              leaseKey: key
            });
          })
          .finally(() => {
            heartbeatTask = undefined;
          });
      })
      .catch(() => {
        lost = true;
      })
      .finally(() => {
        renewal = undefined;
      });
  }, leaseTtlMs / 3);
  timer.unref();

  try {
    return await run({
      token,
      isActive: () => active && !lost,
      assertOwned,
      setHeartbeat: (callback) => {
        heartbeat = callback;
      }
    });
  } finally {
    active = false;
    heartbeat = undefined;
    clearInterval(timer);
    await renewal;
    await heartbeatTask;
    try {
      await redis.eval(releaseScript, 1, key, token);
    } catch {
      logger.warn('Failed to release Sandbox lifecycle lease; waiting for expiry');
    }
  }
};
