import {
  fake,
  scope,
  acquire,
  retainedContent,
  seedMissingRuntime,
  useClient
} from './missingRuntimeRecovery.fixture';
import { describe, expect, it } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getChatSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';

describe('missing Docker appRuntime recovery', () => {
  it.each(['business', 'browser', 'ide'] as const)(
    'restores historical null resource limits through %s without replacing the original volume',
    async (entry) => {
      const original = await seedMissingRuntime();
      await MongoSandboxInstance.updateOne(
        { sandboxId: original.sandboxId },
        {
          $set: {
            'metadata.runtimeConfig.resourceLimits': null,
            'metadata.runtimeConfig.timeoutSeconds': null
          }
        }
      );
      const client = await useClient(entry);
      expect(await client.provider.execute('cat /workspace/retained.txt')).toMatchObject({
        exitCode: 0,
        stdout: retainedContent
      });
      expect(fake.creations).toHaveLength(1);
      expect(fake.creations[0].resourceLimits).toBeUndefined();
      expect(fake.creations[0].timeoutSeconds).toBeNull();
      expect(fake.creations[0].volumes?.[0].pvc).toEqual({
        claimName: original.claimName,
        createIfNotExists: false,
        deleteOnSandboxTermination: false
      });
      const stored = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
      expect(stored?.status).toBe('running');
      expect(stored?.operation?.checkpoint).toBe('ready');
      expect(fake.volumeEnsure).not.toHaveBeenCalled();
      expect(fake.volumeConfirm).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    }
  );

  it('uses saved instance limits when historical runtime resource limits are null', async () => {
    const original = await seedMissingRuntime();
    const limits = { cpuCount: 2, memoryMiB: 2048, diskGiB: 10 };
    await MongoSandboxInstance.updateOne(
      { sandboxId: original.sandboxId },
      { $set: { 'metadata.runtimeConfig.resourceLimits': null, limit: limits } }
    );
    await acquire();
    expect(fake.creations).toHaveLength(1);
    expect(fake.creations[0].resourceLimits).toMatchObject(limits);
    expect(fake.volumes.get(original.claimName)?.get('/workspace/retained.txt')).toBe(
      retainedContent
    );
  });

  it.each(['invalid', { cpuCount: '2' }])(
    'rejects malformed resource limits instead of dropping them: %j',
    async (resourceLimits) => {
      const original = await seedMissingRuntime();
      await MongoSandboxInstance.updateOne(
        { sandboxId: original.sandboxId },
        { $set: { 'metadata.runtimeConfig.resourceLimits': resourceLimits } }
      );
      await expect(acquire()).rejects.toMatchObject({ name: 'ZodError' });
      expect(fake.creations).toHaveLength(0);
      expect(fake.volumes.get(original.claimName)?.get('/workspace/retained.txt')).toBe(
        retainedContent
      );
      expect(fake.volumeEnsure).not.toHaveBeenCalled();
    }
  );

  it.each(['business', 'browser', 'ide'] as const)(
    'restores the retained files and logical identity through %s',
    async (entry) => {
      const original = await seedMissingRuntime();
      const before = await MongoSandboxInstance.findOne({ sandboxId: original.sandboxId }).lean();
      const client = await useClient(entry);
      expect(client.id).toBe(original.sandboxId);
      expect(await client.provider.execute('cat /workspace/retained.txt')).toMatchObject({
        exitCode: 0,
        stdout: retainedContent
      });
      const stored = await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean();
      expect(stored).toMatchObject({
        status: 'running',
        releasedAt: null,
        storage: before?.storage,
        operation: { checkpoint: 'ready' }
      });
      expect(stored?.metadata?.providerSandboxId).toBe(fake.remotes.get(client.id)?.id);
      expect(stored?.metadata?.providerSandboxId).not.toBe(original.oldProviderId);
      expect(fake.creations).toHaveLength(1);
      expect(fake.creations[0]).toMatchObject({
        image: before?.metadata?.runtimeConfig?.image,
        entrypoint: before?.metadata?.runtimeConfig?.entrypoint,
        env: before?.metadata?.runtimeConfig?.env,
        timeoutSeconds: 900,
        resourceLimits: { cpuCount: 2, memoryMiB: 2048 },
        volumes: [
          {
            subPath: 'user-data',
            pvc: {
              claimName: original.claimName,
              createIfNotExists: false,
              deleteOnSandboxTermination: false
            }
          }
        ]
      });
      expect(fake.volumeEnsure).not.toHaveBeenCalled();
      expect(fake.volumeConfirm).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    }
  );

  it('fails without creating an empty volume when the confirmed volume disappeared', async () => {
    const original = await seedMissingRuntime();
    fake.volumes.delete(original.claimName);
    await expect(acquire()).rejects.toThrow();
    expect(fake.volumes.size).toBe(0);
    expect(fake.remotes.size).toBe(0);
    expect(fake.creations).toHaveLength(0);
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
    expect(fake.volumeConfirm).not.toHaveBeenCalled();
  });

  it.each([
    ['different deployment', { providerScope: 'other-deployment' }],
    ['absent deployment identity', { providerScope: null }],
    ['absent saved runtime configuration', { 'metadata.runtimeConfig': null }],
    ['absent original volume', { 'storage.volumes': [] }],
    ['absent original volume binding', { 'storage.volumeManager': null }],
    [
      'unknown remote result',
      { 'operation.effectState': 'pending', 'operation.failureDisposition': 'unknown' }
    ],
    ['pending remote effect', { 'operation.effectState': 'pending' }],
    ['unconfirmed volume', { 'storage.volumeManager.ensured': false }],
    ['untrusted runtime config', { 'metadata.runtimeConfig.recoverable': false }]
  ])('rejects %s without creating compute or altering retained files', async (_reason, fields) => {
    const original = await seedMissingRuntime();
    await MongoSandboxInstance.updateOne({ sandboxId: original.sandboxId }, { $set: fields });
    await expect(acquire()).rejects.toThrow();
    expect(fake.remotes.size).toBe(0);
    expect(fake.creations).toHaveLength(0);
    expect(fake.volumes.get(original.claimName)?.get('/workspace/retained.txt')).toBe(
      retainedContent
    );
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
    expect(fake.volumeConfirm).not.toHaveBeenCalled();
  });

  it.each(['lookup', 'inspect'] as const)(
    'refuses recovery when provider %s fails',
    async (method) => {
      const original = await seedMissingRuntime();
      if (method === 'lookup') fake.lookupError = new Error('Provider lookup unavailable');
      else fake.inspectError = new Error('Provider inspect unavailable');
      await expect(acquire()).rejects.toThrow();
      expect(fake.creations).toHaveLength(0);
      expect(fake.volumes.get(original.claimName)?.get('/workspace/retained.txt')).toBe(
        retainedContent
      );
      expect(fake.volumeEnsure).not.toHaveBeenCalled();
    }
  );

  it('reuses a running original provider without creating another runtime', async () => {
    const original = await seedMissingRuntime();
    fake.remotes.set(original.sandboxId, {
      id: original.oldProviderId,
      claimName: original.claimName,
      status: { state: 'Running' },
      image: { repository: 'retained-image', tag: 'immutable-original' }
    });
    const client = await acquire();
    expect(await client.provider.execute('cat /workspace/retained.txt')).toMatchObject({
      stdout: retainedContent
    });
    expect(
      (await MongoSandboxInstance.findOne({ sandboxId: client.id }).lean())?.metadata
        ?.providerSandboxId
    ).toBe(original.oldProviderId);
    expect(fake.creations).toHaveLength(0);
  });

  it('rejects a changed provider binding without a receipt for the selected operation', async () => {
    const original = await seedMissingRuntime();
    const selected = await getChatSandboxClient(scope());
    const replacementId = 'provider-unrelated-replacement';
    fake.remotes.set(original.sandboxId, {
      id: replacementId,
      claimName: original.claimName,
      status: { state: 'Running' },
      image: { repository: 'retained-image', tag: 'immutable-original' }
    });
    await MongoSandboxInstance.updateOne(
      { sandboxId: original.sandboxId },
      {
        $set: {
          status: 'running',
          'metadata.providerSandboxId': replacementId,
          'operation.id': 'unrelated-operation',
          'operation.checkpoint': 'ready'
        },
        $unset: { 'operation.error': 1, 'operation.recoveredFromOperationId': 1 }
      }
    );
    await expect(selected.ensureAvailable('interactive', { upgradeImage: false })).rejects.toThrow(
      'operation_conflict'
    );
    expect(fake.creations).toHaveLength(0);
    expect(fake.volumes.get(original.claimName)?.get('/workspace/retained.txt')).toBe(
      retainedContent
    );
    expect(
      (await MongoSandboxInstance.findOne({ sandboxId: original.sandboxId }).lean())?.metadata
        ?.providerSandboxId
    ).toBe(replacementId);
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
  });

  it('creates only one replacement for concurrent business and browser requests', async () => {
    const original = await seedMissingRuntime();
    const outcomes = await Promise.allSettled([useClient('business'), useClient('browser')]);
    const clients = outcomes.map((outcome) => {
      if (outcome.status === 'rejected') throw outcome.reason;
      return outcome.value;
    });
    expect(clients.map((client) => client.id)).toEqual([original.sandboxId, original.sandboxId]);
    for (const client of clients) {
      expect(await client.provider.execute('cat /workspace/retained.txt')).toMatchObject({
        stdout: retainedContent
      });
    }
    expect(fake.creations).toHaveLength(1);
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
    expect(fake.volumeEnsure).not.toHaveBeenCalled();
  });
});
