import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { createAgentSandbox } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle';
import { generateSandboxIdentityId } from '@fastgpt/service/core/ai/sandbox/identity';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { randomUUID } from 'node:crypto';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

const { getClientMock } = vi.hoisted(() => ({ getClientMock: vi.fn() }));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    env: {
      ...original.env,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_ENABLE_VOLUME: true,
      AGENT_SANDBOX_VOLUME_MANAGER_URL: 'http://volume.test',
      AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH: '/workspace',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.example.test:8090'
    }
  };
});
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getSandboxClient: getClientMock
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxDeployment', () => ({
  deploySandboxSkillPackages: async () => ({
    manifest: { schemaVersion: 1, entries: [] },
    deployedSkills: []
  })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<unknown>) =>
    run({ token: randomUUID(), assertOwned: async () => undefined, setHeartbeat: vi.fn() })
}));

describe('Skill runtime sandbox identity', () => {
  let previousFeConfigs: typeof global.feConfigs;
  const params = {
    appId: new Types.ObjectId().toHexString(),
    runtimeUserId: 'final-user',
    teamId: new Types.ObjectId().toHexString(),
    tmbId: new Types.ObjectId().toHexString(),
    sessionId: 'shared-chat',
    skillIds: []
  };
  const expectedId = generateSandboxIdentityId({
    sourceType: 'appRuntime',
    sourceId: params.appId,
    runtimeUserId: params.runtimeUserId,
    reuseScope: 'user'
  });

  beforeEach(() => {
    vi.clearAllMocks();
    previousFeConfigs = global.feConfigs;
    global.feConfigs = { ...global.feConfigs, limit: {} };
    getClientMock.mockImplementation(
      async (props: { sandboxId?: string; appId: string; userId: string; chatId: string }) => {
        const sandboxId =
          props.sandboxId ??
          generateSandboxIdentityId({
            sourceType: 'appRuntime',
            sourceId: props.appId,
            runtimeUserId: props.userId,
            reuseScope: 'user'
          });
        await MongoSandboxInstance.updateOne(
          { provider: 'opensandbox', sandboxId: sandboxId },
          {
            $setOnInsert: {
              sandboxId,
              appId: props.appId,
              userId: props.userId,
              sourceType: 'appRuntime',
              sourceId: props.appId,
              runtimeUserId: props.userId,
              reuseScope: 'user'
            },
            $set: {
              status: SandboxStatusEnum.running,
              operation: {
                id: randomUUID(),
                type: 'start',
                checkpoint: 'ready',
                startedAt: new Date(),
                updatedAt: new Date()
              }
            }
          },
          { upsert: true }
        );
        return {
          provider: {
            provider: 'opensandbox',
            getInfo: async () => ({
              id: `provider-${sandboxId}`,
              image: { repository: 'test-image', tag: 'latest' },
              createdAt: new Date()
            }),
            execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
            readFiles: async () => [],
            close: async () => undefined
          },
          delete: async () => MongoSandboxInstance.deleteOne({ sandboxId: sandboxId })
        };
      }
    );
  });

  afterEach(() => {
    global.feConfigs = previousFeConfigs;
  });

  it('persists the real app, final user and canonical identity', async () => {
    const result = await createAgentSandbox(params);
    expect(result).toMatchObject({
      sandboxId: expectedId,
      providerSandboxId: `provider-${expectedId}`,
      sessionId: params.sessionId
    });
    expect(await MongoSandboxInstance.findOne({ sandboxId: expectedId }).lean()).toMatchObject({
      appId: params.appId,
      userId: params.runtimeUserId,
      reuseScope: 'user',
      sourceType: 'appRuntime',
      sourceId: params.appId,
      runtimeUserId: params.runtimeUserId,
      metadata: { providerSandboxId: `provider-${expectedId}` }
    });
  });

  it('does not reuse a runtime belonging to another app', async () => {
    const first = await createAgentSandbox(params);
    const second = await createAgentSandbox({ ...params, appId: 'another-app' });
    expect(second.providerSandboxId).not.toBe(first.providerSandboxId);
    expect(await MongoSandboxInstance.countDocuments()).toBe(2);
  });

  it('shares a workspace across chat and debug sessions without changing root ownership', async () => {
    const first = await createAgentSandbox(params);
    const second = await createAgentSandbox({
      ...params,
      sessionId: 'debug-run',
      sourceChatId: 'another-chat'
    });
    expect(second.sandboxId).toBe(first.sandboxId);
    expect(first.workDirectory).toBe('/workspace/sessions/shared-chat');
    expect(second.workDirectory).toBe('/workspace/sessions/another-chat');
    const saved = await MongoSandboxInstance.findOne({ sandboxId: first.sandboxId }).lean();
    expect(saved?.chatId).toBeUndefined();
    expect(saved?.sessionId).toBeUndefined();
    expect(saved?.sourceChatId).toBeUndefined();
  });

  it('preserves a legacy volume while provisioning a separate shared workspace', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'legacy-generic',
      appId: params.appId,
      userId: params.runtimeUserId,
      chatId: params.sessionId,
      storage: {
        mountPath: '/old-workspace',
        volumes: [{ name: 'workspace', claimName: 'old-volume', mountPath: '/old-workspace' }]
      }
    });
    const result = await createAgentSandbox(params);
    expect(result.sandboxId).toBe(expectedId);
    expect(result.workDirectory).toBe('/workspace/sessions/shared-chat');
    expect(await MongoSandboxInstance.countDocuments()).toBe(2);
    expect(
      await MongoSandboxInstance.findOne({ sandboxId: 'legacy-generic' }).lean()
    ).toMatchObject({ storage: { volumes: [{ claimName: 'old-volume' }] } });
  });

  it('does not infer ownership of an old Skill runtime from team and session alone', async () => {
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: params.sessionId,
      appId: params.teamId,
      userId: params.tmbId,
      chatId: params.sessionId,
      metadata: {
        sandboxType: SandboxTypeEnum.sessionRuntime,
        teamId: params.teamId,
        tmbId: params.tmbId
      }
    });
    const result = await createAgentSandbox(params);
    expect(result).toMatchObject({
      sandboxId: expectedId,
      providerSandboxId: `provider-${expectedId}`
    });
    expect(await MongoSandboxInstance.countDocuments()).toBe(2);
  });

  it('uses distinct logical and provider IDs consistently on reuse', async () => {
    const first = await createAgentSandbox(params);
    const second = await createAgentSandbox(params);
    expect(second).toMatchObject({
      sandboxId: expectedId,
      providerSandboxId: first.providerSandboxId
    });
    expect(await MongoSandboxInstance.countDocuments()).toBe(1);
  });

  it('can reuse a completed deployment without forcing another provider start', async () => {
    const first = await createAgentSandbox(params);
    getClientMock.mockImplementationOnce(async () => ({
      provider: {
        provider: 'opensandbox',
        getInfo: async () => ({
          id: first.providerSandboxId,
          image: { repository: 'test-image', tag: 'latest' },
          createdAt: new Date()
        }),
        execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        close: async () => undefined
      }
    }));
    const second = await createAgentSandbox({ ...params, sessionId: 'next-chat' });
    expect(second.sandboxId).toBe(first.sandboxId);
    expect(second.workDirectory).toBe('/workspace/sessions/next-chat');
  });

  it.each([
    { status: 'running', type: undefined, checkpoint: undefined },
    { status: 'stopping', type: 'stop', checkpoint: 'provider_stop' },
    { status: 'provisioning', type: 'start', checkpoint: 'provider_ensure' },
    { status: 'running', type: 'start', checkpoint: 'provider_ensure' },
    { status: 'running', type: 'deploy', checkpoint: 'ready' }
  ])('does not claim a concurrent $type/$checkpoint operation', async (state) => {
    const ensure = getClientMock.getMockImplementation()!;
    const operationId = randomUUID();
    getClientMock.mockImplementationOnce(async (...args) => {
      const client = await ensure(...args);
      await MongoSandboxInstance.updateOne(
        { sandboxId: expectedId },
        state.type
          ? {
              $set: {
                status: state.status,
                operation: {
                  id: operationId,
                  type: state.type,
                  checkpoint: state.checkpoint,
                  startedAt: new Date(),
                  updatedAt: new Date()
                }
              }
            }
          : { $set: { status: state.status }, $unset: { operation: 1 } }
      );
      return client;
    });
    await expect(createAgentSandbox(params)).rejects.toThrow('operation_conflict');
    const saved = await MongoSandboxInstance.findOne({ sandboxId: expectedId }).lean();
    expect(saved?.status).toBe(state.status);
    expect(saved?.operation?.id).toBe(state.type ? operationId : undefined);
  });
});
