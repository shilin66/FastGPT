import {
  fake,
  acquire,
  retainedContent,
  seedMissingRuntime
} from './missingRuntimeRecovery.fixture';
import { describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { recoverSandboxWorkspace } from '@fastgpt/service/core/ai/sandbox/manualRecovery';

const select = async () => {
  const instance = await MongoSandboxInstance.findOne().lean();
  if (!instance) throw new Error('Test workspace missing');
  return instance;
};
const recover = async (options: { rebuildEmpty?: boolean; recoveryRevision?: string } = {}) =>
  recoverSandboxWorkspace(await select(), { ...options, assertAuthorized: async () => {} });

describe('manual sandbox recovery', () => {
  it.each(['Running', 'Stopped'] as const)('reuses the original %s instance', async (state) => {
    const original = await seedMissingRuntime();
    fake.remotes.set(original.sandboxId, {
      id: original.oldProviderId,
      status: { state },
      image: { repository: 'retained-image', tag: 'immutable-original' },
      claimName: original.claimName
    });
    if (state === 'Stopped') {
      await MongoSandboxInstance.updateOne(
        {},
        {
          $set: { status: 'stopped', 'operation.checkpoint': 'ready' },
          $unset: { 'operation.error': 1 }
        }
      );
    }
    expect(await recover()).toMatchObject({ success: true, strategy: 'original' });
    expect(fake.creations).toHaveLength(0);
    expect((await select()).metadata?.providerSandboxId).toBe(original.oldProviderId);
  });

  it('rejects a backup checksum mismatch without creating compute', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    await MongoSandboxInstance.updateOne(
      {},
      {
        $set: {
          archive: {
            key: `sandbox/archive/${original.sandboxId}/${randomUUID()}.tar.gz`,
            size: 14,
            hash: 'a'.repeat(64),
            createdAt: new Date()
          }
        }
      }
    );
    fake.backupExists.mockResolvedValue(true);
    await expect(recover()).rejects.toThrow('sandbox_recovery_backup_unverified');
    expect(fake.creations).toHaveLength(0);
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
  });

  it('retains the saved mount path when creating a new volume', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    await MongoSandboxInstance.updateOne(
      {},
      {
        $set: {
          'storage.mountPath': '/retained-workspace',
          'storage.volumes.0.mountPath': '/retained-workspace',
          'metadata.workspaceRoot': '/retained-workspace'
        }
      }
    );
    const confirmation = await recover();
    await recover({ rebuildEmpty: true, recoveryRevision: confirmation.recoveryRevision });
    expect(fake.creations[0].volumes?.[0].mountPath).toBe('/retained-workspace');
  });
  it('recovers using the original volume without ensuring it', async () => {
    const original = await seedMissingRuntime();
    expect(await recover()).toMatchObject({ success: true, strategy: 'original' });
    expect(fake.volumes.get(original.claimName)?.get('/workspace/retained.txt')).toBe(
      retainedContent
    );
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
    expect((await select()).status).toBe('running');
  });

  it('asks for confirmation without changing the workspace when files and backup are absent', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    const before = await select();
    const result = await recover();
    expect(result).toMatchObject({ success: false, status: 'confirmation_required' });
    expect(result.recoveryRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(await select()).toEqual(before);
    expect(fake.creations).toHaveLength(0);
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
  });

  it('rebuilds empty only with a fresh confirmation and a new volume generation', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    const confirmation = await recover();
    expect(
      await recover({ rebuildEmpty: true, recoveryRevision: confirmation.recoveryRevision })
    ).toMatchObject({ success: true, strategy: 'empty' });
    const stored = await select();
    expect(stored.storage?.volumes?.[0]?.claimName).not.toBe(original.claimName);
    expect(stored.currentDeploymentHash).toBe('');
    expect(fake.volumes.has(original.claimName)).toBe(false);
    expect(fake.creations).toHaveLength(1);
    expect(fake.backupInstall).not.toHaveBeenCalled();
  });

  it('restores a verified backup into a new volume', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    const buffer = Buffer.from('backup-content');
    await MongoSandboxInstance.updateOne(
      {},
      {
        $set: {
          archive: {
            key: `sandbox/archive/${original.sandboxId}/${randomUUID()}.tar.gz`,
            size: buffer.length,
            hash: createHash('sha256').update(buffer).digest('hex'),
            createdAt: new Date()
          }
        }
      }
    );
    fake.backupExists.mockResolvedValue(true);
    expect(await recover()).toMatchObject({ success: true, strategy: 'backup' });
    const stored = await select();
    expect(
      fake.volumes
        .get(stored.storage?.volumes?.[0]?.claimName ?? '')
        ?.get('/workspace/retained.txt')
    ).toBe('backup-content');
    expect(fake.backupInstall).toHaveBeenCalledOnce();
  });

  it.each(['volume', 'backup', 'provider'] as const)(
    'does not offer empty rebuilding on %s lookup failure',
    async (boundary) => {
      const original = await seedMissingRuntime();
      fake.volumes.delete(original.claimName);
      if (boundary === 'volume') fake.volumeInspect.mockRejectedValue(new Error('unavailable'));
      if (boundary === 'provider') fake.inspectError = new Error('unavailable');
      if (boundary === 'backup') {
        await MongoSandboxInstance.updateOne(
          {},
          {
            $set: {
              archive: {
                key: 'backup-key',
                size: 1,
                hash: 'a'.repeat(64),
                createdAt: new Date()
              }
            }
          }
        );
        fake.backupExists.mockRejectedValue(new Error('unavailable'));
      }
      await expect(recover()).rejects.toThrow();
      expect(fake.creations).toHaveLength(0);
      expect(fake.volumeEnsure).not.toHaveBeenCalled();
    }
  );

  it('rejects stale empty confirmation after the workspace changes', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    const confirmation = await recover();
    await MongoSandboxInstance.updateOne({}, { $set: { workspaceGeneration: randomUUID() } });
    await expect(
      recover({ rebuildEmpty: true, recoveryRevision: confirmation.recoveryRevision })
    ).rejects.toThrow();
    expect(fake.creations).toHaveLength(0);
  });

  it('prefers files that reappear after empty rebuilding was confirmed', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    const confirmation = await recover();
    fake.volumes.set(original.claimName, new Map([['/workspace/retained.txt', retainedContent]]));
    expect(
      await recover({ rebuildEmpty: true, recoveryRevision: confirmation.recoveryRevision })
    ).toMatchObject({ success: true, strategy: 'original' });
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
  });

  it('serializes concurrent recovery and dialogue creation without duplicating compute', async () => {
    await seedMissingRuntime();
    const results = await Promise.allSettled([recover(), recover(), acquire()]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(fake.creations).toHaveLength(1);
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
  });

  it('rejects an unknown prior remote effect even with empty confirmation', async () => {
    await seedMissingRuntime();
    await MongoSandboxInstance.updateOne(
      {},
      {
        $set: {
          'operation.effectState': 'pending',
          'operation.failureDisposition': 'unknown'
        }
      }
    );
    await expect(
      recover({ rebuildEmpty: true, recoveryRevision: 'a'.repeat(64) })
    ).rejects.toThrow();
    expect(fake.creations).toHaveLength(0);
  });
});
