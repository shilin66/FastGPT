import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';
import type { SandboxInstanceSchemaType } from '@fastgpt/service/core/ai/sandbox/type';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { VolumeManagerAuthRejectedBeforeEffectError } from '@fastgpt/service/core/ai/sandbox/errors';

const leaseState = vi.hoisted(() => ({ owned: true, sequence: 0 }));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/lease')>();
  return {
    ...original,
    withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<void>) => {
      leaseState.owned = true;
      await run({
        token: `lease-${++leaseState.sequence}`,
        setHeartbeat: vi.fn(),
        assertOwned: async () => {
          if (!leaseState.owned) throw new original.SandboxOperationConflict();
        }
      });
    }
  };
});

const sandboxId = 'operation-fence';
const actions = ['ensure', 'stop', 'delete'] as const;
const seed = async (fields: Partial<SandboxInstanceSchemaType>) => {
  await MongoSandboxInstance.create({ provider: 'opensandbox', sandboxId, ...fields });
  return MongoSandboxInstance.findOne({ sandboxId }).lean();
};
const operation = (type: string, checkpoint: string, updatedAt = new Date()) => ({
  id: 'previous-owner',
  type,
  checkpoint,
  startedAt: updatedAt,
  updatedAt
});
const execute = (action: (typeof actions)[number], run = vi.fn().mockResolvedValue(undefined)) =>
  runSandboxOperation({ provider: 'opensandbox', sandboxId, action }, run);

beforeEach(() => {
  leaseState.owned = true;
  leaseState.sequence = 0;
});

describe('completed local publish rejection', () => {
  it.each(actions)(
    'allows %s without treating the rejected package as a successful publication',
    async (action) => {
      await seed({
        status: 'running',
        operation: {
          ...operation('publish', 'rejected'),
          failureDisposition: 'retryable',
          error: { code: 'invalid_package', message: 'Package rejected' }
        }
      });
      const run = vi.fn().mockResolvedValue(undefined);
      await execute(action, run);
      expect(run).toHaveBeenCalledOnce();
    }
  );
  it.each([
    { type: 'publish', checkpoint: 'rejected', disposition: 'unknown', code: 'invalid_package' },
    {
      type: 'resetWorkspace',
      checkpoint: 'rejected',
      disposition: 'retryable',
      code: 'invalid_package'
    },
    {
      type: 'publish',
      checkpoint: 'package_ready',
      disposition: 'retryable',
      code: 'invalid_package'
    },
    {
      type: 'publish',
      checkpoint: 'rejected',
      disposition: 'retryable',
      code: 'workspace_publish_failed'
    }
  ])('keeps $type/$checkpoint/$disposition/$code fenced', async (phase) => {
    await seed({
      status: 'running',
      operation: {
        ...operation(phase.type, phase.checkpoint),
        failureDisposition: phase.disposition === 'unknown' ? 'unknown' : 'retryable',
        error: { code: phase.code, message: 'Not a confirmed local rejection' }
      }
    });
    for (const action of actions) {
      const run = vi.fn();
      await expect(execute(action, run)).rejects.toThrow('explicit recovery');
      expect(run).not.toHaveBeenCalled();
    }
  });
});

describe('Volume Manager pre-effect authentication rejection', () => {
  it('allows retry after the typed volume-ensure rejection and preserves the original cause', async () => {
    const cause = new Error('HTTP 401');
    const rejection = new VolumeManagerAuthRejectedBeforeEffectError({ status: 401, cause });
    await expect(
      runSandboxOperation(
        { provider: 'opensandbox', sandboxId, action: 'ensure' },
        async (current) => {
          await current.checkpoint('volume_ensure');
          await current.remoteEffect(async () => {
            throw rejection;
          });
        }
      )
    ).rejects.toBe(rejection);
    expect(rejection.cause).toBe(cause);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'failed',
      operation: { checkpoint: 'volume_ensure', failureDisposition: 'retryable' }
    });

    const retry = vi.fn().mockResolvedValue(undefined);
    await execute('ensure', retry);
    expect(retry).toHaveBeenCalledOnce();
  });

  it.each([
    ...[400, 401, 403, 404, 409, 422, 500, 503, 504].map((status) => ({
      label: `unattested HTTP ${status}`,
      error: Object.assign(new Error(`HTTP ${status}`), { status })
    })),
    ...[
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT'
    ].map((code) => ({
      label: code,
      error: Object.assign(new Error('network failure'), { code })
    })),
    { label: 'fetch failure', error: new TypeError('fetch failed') },
    { label: 'aborted request', error: new DOMException('request aborted', 'AbortError') },
    { label: 'auth words only', error: new Error('volume-manager error: 401 Unauthorized') },
    {
      label: 'spoofed type fields',
      error: Object.assign(new Error('Unauthorized'), {
        name: 'VolumeManagerAuthRejectedBeforeEffectError',
        code: 'VOLUME_MANAGER_AUTH_REJECTED',
        status: 401
      })
    },
    {
      label: 'unrelated failure with a typed cause',
      error: new Error('an additional request failed', {
        cause: new VolumeManagerAuthRejectedBeforeEffectError({ status: 401 })
      })
    }
  ])('keeps $label unknown and refuses another dispatch', async ({ error }) => {
    await expect(
      runSandboxOperation(
        { provider: 'opensandbox', sandboxId, action: 'ensure' },
        async (current) => {
          await current.checkpoint('volume_ensure');
          await current.remoteEffect(async () => {
            throw error;
          });
        }
      )
    ).rejects.toBe(error);
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(before).toMatchObject({
      status: 'failed',
      operation: { checkpoint: 'volume_ensure', failureDisposition: 'unknown' }
    });
    const retry = vi.fn();
    await expect(execute('ensure', retry)).rejects.toThrow('explicit recovery');
    expect(retry).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it.each([
    ['ensure', 'provider_ensure'],
    ['stop', 'volume_ensure'],
    ['delete', 'volume_ensure']
  ] as const)('does not accept the typed rejection during %s/%s', async (action, checkpoint) => {
    await seed({ status: 'running' });
    const rejection = new VolumeManagerAuthRejectedBeforeEffectError({ status: 401 });
    await expect(
      runSandboxOperation({ provider: 'opensandbox', sandboxId, action }, async (current) => {
        await current.checkpoint(checkpoint);
        await current.remoteEffect(async () => {
          throw rejection;
        });
      })
    ).rejects.toBe(rejection);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      operation: { checkpoint, failureDisposition: 'unknown' }
    });
  });

  it.each(['uncheckpointed success', 'caught timeout'])(
    'does not clear an earlier %s when a later request is rejected before effect',
    async (earlierResult) => {
      const rejection = new VolumeManagerAuthRejectedBeforeEffectError({ status: 401 });
      await expect(
        runSandboxOperation(
          { provider: 'opensandbox', sandboxId, action: 'ensure' },
          async (current) => {
            await current.checkpoint('volume_ensure');
            await current
              .remoteEffect(async () => {
                if (earlierResult === 'caught timeout') throw new Error('timed out');
              })
              .catch(() => undefined);
            await current.remoteEffect(async () => {
              throw rejection;
            });
          }
        )
      ).rejects.toBe(rejection);
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        operation: { checkpoint: 'volume_ensure', failureDisposition: 'unknown' }
      });
      await expect(execute('ensure')).rejects.toThrow('explicit recovery');
    }
  );

  it('retains unknown when ownership is lost before the typed rejection can be committed', async () => {
    const rejection = new VolumeManagerAuthRejectedBeforeEffectError({ status: 401 });
    await expect(
      runSandboxOperation(
        { provider: 'opensandbox', sandboxId, action: 'ensure' },
        async (current) => {
          await current.checkpoint('volume_ensure');
          await current.remoteEffect(async () => {
            leaseState.owned = false;
            throw rejection;
          });
        }
      )
    ).rejects.toBe(rejection);
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
      status: 'provisioning',
      operation: { checkpoint: 'volume_ensure', failureDisposition: 'unknown' }
    });
    await expect(execute('ensure')).rejects.toThrow('explicit recovery');
  });

  it('does not reinterpret historical unknown volume-ensure records using the new contract', async () => {
    const before = await seed({
      status: 'failed',
      operation: {
        ...operation('provision', 'volume_ensure'),
        failureDisposition: 'unknown',
        error: { code: 'sandbox_unavailable', message: 'volume-manager error: 401 Unauthorized' }
      }
    });
    const run = vi
      .fn()
      .mockRejectedValue(new VolumeManagerAuthRejectedBeforeEffectError({ status: 401 }));
    await expect(execute('ensure', run)).rejects.toThrow('explicit recovery');
    expect(run).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });
});

describe.each(actions)('Sandbox %s ownership fence', (action) => {
  it('does not use an unclassified historical failure as proof that remote effects settled', async () => {
    const before = await seed({
      status: 'failed',
      operation: {
        ...operation('provision', 'provider_ensure'),
        error: { code: 'sandbox_unavailable', message: 'request timed out' }
      }
    });
    await expect(execute(action)).rejects.toThrow('explicit recovery');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it.each(['archived', 'archiving', 'restoring'] as const)(
    'does not mutate unsupported %s resources',
    async (status) => {
      const before = await seed({ status, operation: operation('archive', 'uploaded') });
      const run = vi.fn();
      await expect(execute(action, run)).rejects.toThrow('archive');
      expect(run).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    }
  );

  it.each([
    ['editInitialize', 'workspace_inspect', 0],
    ['deploy', 'deploying', 0],
    ['editInitialize', 'package_extract', 3_600_000],
    ['deploy', 'deploying', 3_600_000]
  ] as const)(
    'cannot take over unfinished %s/%s even when its heartbeat is %ims old',
    async (type, checkpoint, age) => {
      const before = await seed({
        status: 'provisioning',
        operation: operation(type, checkpoint, new Date(Date.now() - age))
      });
      const run = vi.fn();
      await expect(execute(action, run)).rejects.toThrow('explicit recovery');
      expect(run).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    }
  );

  it('does not treat an old error on a running operation as a retry permit', async () => {
    const before = await seed({
      status: 'running',
      operation: {
        ...operation('editInitialize', 'workspace_inspect'),
        error: { code: 'old_failure', message: 'old' }
      }
    });
    await expect(execute(action)).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it('does not treat an untracked provisioning record as safe legacy state', async () => {
    const before = await seed({ status: 'provisioning' });
    await expect(execute(action)).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });
});

describe('Sandbox terminal operation handoff', () => {
  it('permits retry after a known local failure before any remote effect', async () => {
    await expect(
      runSandboxOperation({ provider: 'opensandbox', sandboxId, action: 'ensure' }, async () => {
        throw new Error('Invalid local configuration');
      })
    ).rejects.toThrow('Invalid local configuration');
    const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    expect(instance?.operation?.failureDisposition).toBe('retryable');
    const run = vi.fn().mockResolvedValue(undefined);
    await execute('ensure', run);
    expect(run).toHaveBeenCalledOnce();
  });

  it.each(actions)(
    'never treats an unfinished maintenance reset as safe for %s',
    async (action) => {
      const before = await seed({
        status: 'failed',
        operation: {
          ...operation('resetWorkspace', 'maintenance_ready'),
          failureDisposition: 'retryable',
          error: { code: 'reset_failed', message: 'staging failed' }
        }
      });
      await expect(execute(action)).rejects.toThrow('explicit recovery');
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    }
  );

  it.each([
    ['running', 'provision', 'ready'],
    ['running', 'start', 'ready'],
    ['running', 'editInitialize', 'ready'],
    ['running', 'deploy', 'completed'],
    ['stopped', 'stop', 'provider_stopped']
  ] as const)('allows the completed %s/%s/%s handoff', async (status, type, checkpoint) => {
    await seed({ status, operation: operation(type, checkpoint) });
    const run = vi.fn().mockResolvedValue(undefined);
    await execute('ensure', run);
    expect(run).toHaveBeenCalledOnce();
  });

  it.each(['running', 'stopped'] as const)(
    'allows safe legacy %s without an operation',
    async (status) => {
      await seed({ status });
      const run = vi.fn().mockResolvedValue(undefined);
      await execute('ensure', run);
      expect(run).toHaveBeenCalledOnce();
    }
  );

  it('retains failed historical state without a recorded settled result', async () => {
    const before = await seed({ status: 'failed' });
    await expect(execute('ensure')).rejects.toThrow('explicit recovery');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it.each(['publish', 'resetWorkspace'])(
    'accepts a completed %s workspace handoff',
    async (type) => {
      await seed({ status: 'running', operation: operation(type, 'ready') });
      const run = vi.fn().mockResolvedValue(undefined);
      await execute('stop', run);
      expect(run).toHaveBeenCalledOnce();
    }
  );

  it.each(['editInitialize', 'deploy', 'provision', 'stop'])(
    'allows retry after a recorded %s failure',
    async (type) => {
      await seed({
        status: 'failed',
        operation: {
          ...operation(type, 'pending'),
          failureDisposition: 'retryable',
          error: { code: 'explicit_failure', message: 'settled failure' }
        }
      });
      const run = vi.fn().mockResolvedValue(undefined);
      await execute('ensure', run);
      expect(run).toHaveBeenCalledOnce();
    }
  );

  it('allows deletion retry only for a recorded delete failure', async () => {
    await seed({
      status: 'deleting',
      operation: {
        ...operation('delete', 'provider_deleted'),
        failureDisposition: 'retryable',
        error: { code: 'sandbox_delete_failed', message: 'volume busy' }
      }
    });
    const run = vi.fn().mockResolvedValue(undefined);
    await execute('delete', run);
    expect(run).toHaveBeenCalledOnce();
  });

  it('does not allow a non-delete error to unlock a deleting resource', async () => {
    const before = await seed({
      status: 'deleting',
      operation: {
        ...operation('editInitialize', 'pending'),
        error: { code: 'old_failure', message: 'old' }
      }
    });
    await expect(execute('delete')).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it('fences a failed operation that has no explicit failure result', async () => {
    const before = await seed({ status: 'failed', operation: operation('deploy', 'deploying') });
    await expect(execute('ensure')).rejects.toThrow('operation_conflict');
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it('does not admit a replacement token after the previous operation lost its lease', async () => {
    await expect(
      runSandboxOperation(
        { provider: 'opensandbox', sandboxId, action: 'ensure' },
        async (current) => {
          await current.checkpoint('provider_ensure');
          leaseState.owned = false;
          await current.checkpoint('ready', { status: 'running' });
        }
      )
    ).rejects.toThrow('operation_conflict');
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    const replacement = vi.fn();
    await expect(execute('ensure', replacement)).rejects.toThrow('explicit recovery');
    expect(replacement).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it('does not overwrite an Edit handoff that reuses the previous operation ID', async () => {
    await seed({ status: 'running', operation: operation('provision', 'ready') });
    const findOneAndUpdate = MongoSandboxInstance.collection.findOneAndUpdate.bind(
      MongoSandboxInstance.collection
    );
    const claimSpy = vi
      .spyOn(MongoSandboxInstance.collection, 'findOneAndUpdate')
      .mockImplementation(async (...args) => {
        await MongoSandboxInstance.updateOne(
          { sandboxId },
          {
            $set: {
              status: 'provisioning',
              'operation.type': 'editInitialize',
              'operation.checkpoint': 'workspace_inspect',
              'operation.updatedAt': new Date()
            }
          }
        );
        return findOneAndUpdate(...args);
      });
    try {
      await expect(execute('stop')).rejects.toThrow('operation_conflict');
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'provisioning',
        operation: { id: 'previous-owner', type: 'editInitialize', checkpoint: 'workspace_inspect' }
      });
    } finally {
      claimSpy.mockRestore();
    }
  });
});

describe('Sandbox rolling-upgrade stop compatibility', () => {
  const completedOperations = [
    ['provision', 'ready'],
    ['start', 'ready'],
    ['editInitialize', 'ready'],
    ['deploy', 'completed']
  ] as const;

  it.each(completedOperations)(
    'resumes completed %s/%s after the old writer changes only status to stopped',
    async (type, checkpoint) => {
      const before = await seed({
        status: 'running',
        operation: operation(type, checkpoint),
        metadata: { workspaceRoot: '/workspace' }
      });
      await MongoSandboxInstance.updateOne({ sandboxId }, { $set: { status: 'stopped' } });

      await runSandboxOperation(
        { provider: 'opensandbox', sandboxId, action: 'ensure' },
        async (current) => {
          expect(current.previous?.operation).toEqual(before?.operation);
          await current.checkpoint('ready', { status: 'running' });
        }
      );

      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        _id: before?._id,
        status: 'running',
        metadata: before?.metadata,
        operation: { type: 'start', checkpoint: 'ready' }
      });
    }
  );

  describe.each(['stop', 'delete'] as const)('%s remains fenced', (action) => {
    it.each(completedOperations)(
      'does not extend %s/%s legacy stopped compatibility to other actions',
      async (type, checkpoint) => {
        const before = await seed({ status: 'stopped', operation: operation(type, checkpoint) });
        const run = vi.fn();
        await expect(execute(action, run)).rejects.toThrow('operation_conflict');
        expect(run).not.toHaveBeenCalled();
        expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
      }
    );
  });

  it.each([
    ['stopped', 'stop', 'provider_stop'],
    ['stopped', 'start', 'provider_ensure'],
    ['stopped', 'editInitialize', 'workspace_inspect'],
    ['stopped', 'deploy', 'deploying'],
    ['provisioning', 'editInitialize', 'ready']
  ] as const)('still rejects unfinished %s/%s/%s', async (status, type, checkpoint) => {
    const before = await seed({ status, operation: operation(type, checkpoint) });
    const run = vi.fn();
    await expect(execute('ensure', run)).rejects.toThrow('operation_conflict');
    expect(run).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });

  it('does not resume a stopped initialization whose checkpoint is missing', async () => {
    await seed({ status: 'stopped', operation: operation('editInitialize', 'ready') });
    await MongoSandboxInstance.updateOne({ sandboxId }, { $unset: { 'operation.checkpoint': 1 } });
    const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    const run = vi.fn();
    await expect(execute('ensure', run)).rejects.toThrow('operation_conflict');
    expect(run).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
  });
});
