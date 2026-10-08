import { getGlobalRedisConnection } from '../../../common/redis';
import type { SandboxInstanceSchemaType } from './type';
import { SandboxOperationConflict, withSandboxReadLease } from './lease';
import { disconnectFromProviderSandbox } from '../../agentSkills/sandboxConfig';
import { assertSandboxTerminalIdle, SkillTerminalActivityError } from './terminal';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const ttlMs = 45_000;
const activityKey = (instance: SandboxInstanceSchemaType) => {
  const editor = instance.metadata?.editor;
  if (
    !editor ||
    editor.providerSandboxId !== instance.metadata?.providerSandboxId ||
    editor.providerScope !== instance.providerScope ||
    editor.workspaceGeneration !== instance.workspaceGeneration
  )
    throw new SandboxOperationConflict('Editor activity binding changed');
  return `sandbox-editor-activity:${instance.provider}:${editor.providerScope}:${instance.sandboxId}:${editor.providerSandboxId}:${editor.generation}`;
};

export const editorActivityScript = `local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local mode = ARGV[1]
if mode == 'count' then return redis.call('ZCARD', KEYS[1]) end
if mode == 'close' then redis.call('ZREM', KEYS[1], ARGV[2]); return 1 end
if mode == 'renew' and not redis.call('ZSCORE', KEYS[1], ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[2])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]) * 2)
return 1`;

const editorActivity = async (instance: SandboxInstanceSchemaType, mode: string, id = '') => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getGlobalRedisConnection().eval(
        editorActivityScript,
        1,
        activityKey(instance),
        mode,
        id,
        ttlMs
      ),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SandboxEditorActivityError('probe_failed')), 4_000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const withSandboxEditorConnection = async <T>(
  instance: SandboxInstanceSchemaType,
  connection: { id: string; mode: 'open' | 'renew' | 'close' },
  authorize: () => Promise<T>
): Promise<T> =>
  withSandboxReadLease(
    `sandbox:lease:${instance.provider}:${instance.sandboxId}`,
    async (lease) => {
      const result = await authorize();
      await lease.assertOwned();
      const updated = await editorActivity(instance, connection.mode, connection.id);
      if (updated !== 1) throw new SandboxOperationConflict('Editor connection expired');
      await lease.assertOwned();
      return result;
    },
    { priority: 'interactive', waitMs: 1_000 }
  );

export class SandboxEditorActivityError extends SandboxOperationConflict {
  constructor(readonly reason: 'busy' | 'probe_failed') {
    super(`sandbox_editor_terminal_${reason}`);
  }
}

export const assertSandboxEditorIdle = async (instance: SandboxInstanceSchemaType) => {
  if (instance.sourceType !== 'appRuntime' || !instance.metadata?.editor) return;
  if (
    instance.metadata.editor.providerSandboxId !== instance.metadata.providerSandboxId ||
    instance.metadata.editor.workspaceGeneration !== instance.workspaceGeneration
  )
    return;
  const count = await editorActivity(instance, 'count');
  if (typeof count !== 'number') throw new SandboxEditorActivityError('probe_failed');
  if (count > 0) throw new SandboxEditorActivityError('busy');
  const { getExistingSandboxClient } = await import('./controller');
  const provider = getExistingSandboxClient(instance, { requestTimeoutSeconds: 5 }).provider;
  try {
    if (!('inspectExisting' in provider) || typeof provider.inspectExisting !== 'function')
      throw new SandboxEditorActivityError('probe_failed');
    const remote = await provider.inspectExisting(instance.metadata.providerSandboxId);
    if (!remote) {
      if (instance.releasedAt) return;
      throw new SandboxEditorActivityError('probe_failed');
    }
    if (remote.id !== instance.metadata.providerSandboxId)
      throw new SandboxEditorActivityError('probe_failed');
    if (remote.status.state === 'Stopped') return;
    if (
      remote.status.state !== 'Running' ||
      !('connectExisting' in provider) ||
      typeof provider.connectExisting !== 'function' ||
      !(await provider.connectExisting()) ||
      provider.id !== instance.metadata.providerSandboxId
    )
      throw new SandboxEditorActivityError('probe_failed');
    await assertSandboxTerminalIdle(provider).catch((error) => {
      throw new SandboxEditorActivityError(
        error instanceof SkillTerminalActivityError ? error.reason : 'probe_failed'
      );
    });
  } finally {
    if (provider.id) {
      await disconnectFromProviderSandbox(provider).catch(() => {
        logger.warn('Editor activity probe transport cleanup failed', {
          sandboxId: instance.sandboxId
        });
      });
    }
  }
};
