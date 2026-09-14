import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { runSandboxOperation } from '@fastgpt/service/core/ai/sandbox/operation';
import { VolumeManagerAuthRejectedBeforeEffectError } from '@fastgpt/service/core/ai/sandbox/errors';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import type { SandboxInstanceSchemaType } from '@fastgpt/service/core/ai/sandbox/type';
import { SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<void>) =>
    run({ token: randomUUID(), assertOwned: async () => undefined, setHeartbeat: vi.fn() })
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/env')>()),
  env: {
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.example.test',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'qa-image',
    AGENT_SANDBOX_ENABLE_VOLUME: false,
    AGENT_SANDBOX_MAX_EDIT_DEBUG: undefined,
    AGENT_SANDBOX_MAX_SESSION_RUNTIME: undefined
  }
}));

let previousConfig: typeof global.feConfigs;
beforeEach(() => {
  previousConfig = global.feConfigs;
  global.feConfigs = { ...global.feConfigs, limit: {} };
});
afterEach(() => {
  global.feConfigs = previousConfig;
  vi.restoreAllMocks();
});

describe.each([SandboxTypeEnum.editDebug, SandboxTypeEnum.sessionRuntime])(
  'Shared resume admission: %s',
  (sandboxType) => {
    const limit = (value: number) => {
      global.feConfigs.limit = {
        [sandboxType === SandboxTypeEnum.editDebug
          ? 'agentSandboxMaxEditDebug'
          : 'agentSandboxMaxSessionRuntime']: value
      };
    };
    const seed = async (fields: Partial<SandboxInstanceSchemaType> = {}) => {
      const sandboxId = randomUUID();
      await MongoSandboxInstance.create({
        provider: 'opensandbox',
        sandboxId,
        status: 'stopped',
        workspaceGeneration: 'original-generation',
        metadata: { sandboxType, workspaceRoot: '/workspace', providerSandboxId: 'provider-id' },
        storage: {
          volumeManager: {
            protocol: 'claimName',
            baseUrl: 'http://volume.example.test',
            target: 'original-claim',
            ensured: true
          }
        },
        ...fields
      });
      return sandboxId;
    };
    const ensure = (
      sandboxId: string,
      run: Parameters<typeof runSandboxOperation>[1],
      insert?: Parameters<typeof runSandboxOperation>[0]['insert']
    ) => runSandboxOperation({ provider: 'opensandbox', sandboxId, action: 'ensure', insert }, run);
    const ready: Parameters<typeof runSandboxOperation>[1] = async (operation) => {
      await operation.remoteEffect(async () => undefined);
      await operation.checkpoint('ready', { status: 'running' });
    };

    it('persists the known capacity type before the Provider creates the instance', async () => {
      const sandboxId = randomUUID();
      const provider = vi
        .spyOn(OpenSandboxAdapter.prototype, 'ensureRunning')
        .mockImplementation(async () => {
          expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
            status: 'provisioning',
            metadata: { sandboxType }
          });
        });
      const client = new SandboxClient(
        { sandboxId },
        {
          provider: 'opensandbox',
          createConfig: { image: { repository: 'qa-image' }, metadata: { sandboxType } }
        }
      );
      await client.ensureAvailable();
      expect(provider).toHaveBeenCalledOnce();
    });

    it.each([0, 1])('preserves the paused record before any effect at limit %i', async (value) => {
      limit(value);
      if (value) await seed({ status: 'running' });
      const sandboxId = await seed();
      const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      const run = vi.fn(ready);
      await expect(ensure(sandboxId, run)).rejects.toThrow('sandbox limit reached');
      expect(run).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    });

    it('counts a successfully resumed instance before the next sequential admission', async () => {
      limit(1);
      const first = await seed();
      await ensure(first, ready);
      expect(await MongoSandboxInstance.findOne({ sandboxId: first }).lean()).toMatchObject({
        status: 'running',
        metadata: { sandboxType }
      });
      const second = await seed();
      const run = vi.fn(ready);
      await expect(ensure(second, run)).rejects.toThrow('sandbox limit reached');
      expect(run).not.toHaveBeenCalled();
    });

    it('allows an unconfigured limit and does not count the other capacity group', async () => {
      const sandboxId = await seed();
      await ensure(sandboxId, ready);
      limit(1);
      await MongoSandboxInstance.updateOne({ sandboxId }, { $set: { status: 'stopped' } });
      await seed({
        status: 'running',
        metadata: {
          sandboxType:
            sandboxType === SandboxTypeEnum.editDebug
              ? SandboxTypeEnum.sessionRuntime
              : SandboxTypeEnum.editDebug
        }
      });
      await ensure(sandboxId, ready);
    });

    it('does not block an already running instance when the configured limit is zero', async () => {
      limit(0);
      const sandboxId = await seed({ status: 'running' });
      const run = vi.fn(ready);
      await ensure(sandboxId, run);
      expect(run).toHaveBeenCalledOnce();
    });

    it('rechecks admission after a no-effect volume rejection changed stopped to failed', async () => {
      limit(1);
      const sandboxId = await seed();
      await expect(
        ensure(sandboxId, async (operation) => {
          await operation.checkpoint('volume_ensure');
          await operation.remoteEffect(async () => {
            throw new VolumeManagerAuthRejectedBeforeEffectError({ status: 401 });
          });
        })
      ).rejects.toBeInstanceOf(VolumeManagerAuthRejectedBeforeEffectError);
      const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(before).toMatchObject({
        status: 'failed',
        operation: { failureDisposition: 'retryable' }
      });
      await seed({ status: 'running' });
      const run = vi.fn(ready);
      await expect(ensure(sandboxId, run)).rejects.toThrow('sandbox limit reached');
      expect(run).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
    });

    if (sandboxType === SandboxTypeEnum.editDebug) {
      it('classifies and counts canonical Edit records even before metadata enrichment', async () => {
        limit(1);
        await seed({ status: 'running', sourceType: 'skillEdit', metadata: {} });
        const sandboxId = await seed({ sourceType: 'skillEdit', metadata: {} });
        const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
        const run = vi.fn(ready);
        await expect(ensure(sandboxId, run)).rejects.toThrow('sandbox limit reached');
        expect(run).not.toHaveBeenCalled();
        expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
      });
    } else {
      it('uses an explicit Runtime caller type to check an untyped historical instance', async () => {
        limit(0);
        const sandboxId = await seed({ sourceType: 'appRuntime', metadata: {} });
        const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
        const run = vi.fn(ready);
        await expect(ensure(sandboxId, run, { metadata: { sandboxType } })).rejects.toThrow(
          'sandbox limit reached'
        );
        expect(run).not.toHaveBeenCalled();
        expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(before);
      });

      it.each([{}, null])(
        'persists the explicit caller type with historical metadata %j',
        async (metadata) => {
          limit(1);
          const first = await seed({ sourceType: 'appRuntime', metadata });
          await ensure(first, ready, { metadata: { sandboxType } });
          expect(await MongoSandboxInstance.findOne({ sandboxId: first }).lean()).toMatchObject({
            status: 'running',
            metadata: { sandboxType }
          });
          await expect(ensure(await seed(), ready)).rejects.toThrow('sandbox limit reached');
        }
      );

      it('does not infer Runtime capacity from the ordinary VM appRuntime identity alone', async () => {
        limit(0);
        const sandboxId = await seed({ sourceType: 'appRuntime', metadata: {} });
        const run = vi.fn(ready);
        await ensure(sandboxId, run);
        expect(run).toHaveBeenCalledOnce();
      });
    }
  }
);
