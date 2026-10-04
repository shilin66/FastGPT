import { randomUUID } from 'node:crypto';
import { getGlobalRedisConnection } from '../../../common/redis';
import { getLogger, LogCategories } from '../../../common/logger';

const leaseTtlMs = 30_000;
const defaultLeaseWaitMs = 45_000;
const leaseRetryMs = 100;
const sandboxLeaseKeys = (key: string) => [key, `${key}:readers`, `${key}:waiters`] as const;
const sandboxClock = `local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)`;
const acquireSandboxWriterScript = `${sandboxClock}
local member = ARGV[3] .. ':' .. ARGV[1]
redis.call('ZADD', KEYS[3], now + tonumber(ARGV[2]), member)
redis.call('PEXPIRE', KEYS[3], tonumber(ARGV[2]) * 2)
if redis.call('ZCARD', KEYS[2]) > 0 then return 0 end
local waiters = redis.call('ZRANGE', KEYS[3], 0, -1)
for _, waiter in ipairs(waiters) do
  local priority = tonumber(string.match(waiter, '^(%d+):'))
  if priority < tonumber(ARGV[3]) then return 0 end
end
if redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') == false then return 0 end
redis.call('ZREM', KEYS[3], member)
return 1`;
const acquireSandboxReaderScript = `${sandboxClock}
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
local waiters = redis.call('ZRANGE', KEYS[3], 0, -1)
for _, waiter in ipairs(waiters) do
  local priority = tonumber(string.match(waiter, '^(%d+):'))
  if priority <= tonumber(ARGV[3]) then return 0 end
end
redis.call('ZADD', KEYS[2], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[2]) * 2)
return 1`;
const renewSandboxReaderScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local expires = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not expires or tonumber(expires) <= now then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) * 2)
return 1`;
const releaseSandboxReaderScript = `return redis.call('ZREM', KEYS[1], ARGV[1])`;
const releaseSandboxWaiterScript = `return redis.call('ZREM', KEYS[1], ARGV[1])`;
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
    this.name = 'SandboxOperationConflict';
  }
}

/** No Sandbox effect has started; the caller may safely wait and retry. */
export class SandboxBusyBeforeEffectError extends SandboxOperationConflict {
  constructor() {
    super('Sandbox is busy before execution');
    this.name = 'SandboxBusyBeforeEffectError';
  }
}

export const isTransientSandboxConflict = (error: unknown): boolean =>
  error instanceof SandboxBusyBeforeEffectError ||
  (error instanceof Error && error.message === 'operation_conflict');

export type SandboxLease = {
  token: string;
  isActive: () => boolean;
  assertOwned: () => Promise<void>;
  setHeartbeat: (heartbeat?: () => Promise<boolean>) => void;
};

type SandboxWriterPriority = 'interactive' | 'agent' | 'lifecycle';
const priorityRank: Record<SandboxWriterPriority, number> = {
  agent: 0,
  interactive: 1,
  lifecycle: 2
};

export const withSandboxLease = async <T>(
  key: string,
  run: (lease: SandboxLease) => Promise<T>,
  options?: { priority?: SandboxWriterPriority; waitMs?: number }
): Promise<T> => {
  const redis = getGlobalRedisConnection();
  const token = randomUUID();
  const sandboxKeys = key.startsWith('sandbox:lease:') ? sandboxLeaseKeys(key) : undefined;
  if (sandboxKeys) {
    const priority = priorityRank[options?.priority ?? 'lifecycle'];
    const deadline = Date.now() + (options?.waitMs ?? defaultLeaseWaitMs);
    try {
      for (;;) {
        const acquired = await redis.eval(
          acquireSandboxWriterScript,
          3,
          ...sandboxKeys,
          token,
          leaseTtlMs,
          priority
        );
        if (acquired === 1) break;
        if (Date.now() >= deadline) throw new SandboxBusyBeforeEffectError();
        await new Promise<void>((resolve) => setTimeout(resolve, leaseRetryMs));
      }
    } finally {
      await redis.eval(releaseSandboxWaiterScript, 1, sandboxKeys[2], `${priority}:${token}`);
    }
  } else {
    const deadline =
      Date.now() + (key.startsWith('sandbox-source:') ? options?.waitMs ?? defaultLeaseWaitMs : 0);
    while ((await redis.set(key, token, 'PX', leaseTtlMs, 'NX')) !== 'OK') {
      if (Date.now() >= deadline) throw new SandboxBusyBeforeEffectError();
      await new Promise<void>((resolve) => setTimeout(resolve, leaseRetryMs));
    }
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

/** Readers pin the current workspace without serializing file previews and Agent tools. */
export const withSandboxReadLease = async <T>(
  key: string,
  run: (lease: SandboxLease) => Promise<T>,
  options: { waitMs?: number; priority?: 'agent' | 'interactive' | 'preview' } = {}
): Promise<T> => {
  const redis = getGlobalRedisConnection();
  const token = randomUUID();
  const keys = sandboxLeaseKeys(key);
  const deadline = Date.now() + (options.waitMs ?? 8_000);
  const priority = options.priority === 'agent' ? 0 : options.priority === 'interactive' ? 1 : 3;
  for (;;) {
    if (
      (await redis.eval(acquireSandboxReaderScript, 3, ...keys, token, leaseTtlMs, priority)) === 1
    )
      break;
    if (Date.now() >= deadline) throw new SandboxBusyBeforeEffectError();
    await new Promise<void>((resolve) => setTimeout(resolve, leaseRetryMs));
  }
  let active = true;
  let lost = false;
  let renewing: Promise<void> | undefined;
  const assertOwned = async () => {
    if (!active || lost) throw new SandboxOperationConflict();
    if ((await redis.eval(renewSandboxReaderScript, 1, keys[1], token, leaseTtlMs)) !== 1) {
      lost = true;
      throw new SandboxOperationConflict();
    }
  };
  const timer = setInterval(() => {
    if (renewing || lost || !active) return;
    renewing = assertOwned()
      .catch(() => {
        lost = true;
      })
      .finally(() => {
        renewing = undefined;
      });
  }, leaseTtlMs / 3);
  timer.unref();
  try {
    return await run({
      token,
      isActive: () => active && !lost,
      assertOwned,
      setHeartbeat: () => {}
    });
  } finally {
    active = false;
    clearInterval(timer);
    await renewing;
    try {
      await redis.eval(releaseSandboxReaderScript, 1, keys[1], token);
    } catch {
      logger.warn('Failed to release Sandbox reader lease; waiting for expiry');
    }
  }
};
