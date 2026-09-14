import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { resetEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/service';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import type { SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');
const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  mount: vi.fn(),
  exchange: vi.fn(),
  maintain: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: (_key: string, run: (lease: SandboxLease) => Promise<unknown>) =>
    run({ token: 'reset-operation', assertOwned: async () => {}, setHeartbeat: () => {} })
}));
vi.mock('@fastgpt/service/env', async (original) => ({
  env: {
    ...(await original<typeof import('@fastgpt/service/env')>()).env,
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker'
  }
}));
vi.mock('@fastgpt/service/core/agentSkills/storage', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/agentSkills/storage')>()),
  downloadSkillPackage: mocks.download
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxWorkspace', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/agentSkills/sandboxWorkspace')>()),
  assertEditWorkspacePersistentMount: mocks.mount,
  resetEditSandboxWorkspace: mocks.exchange
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/agentSkills/sandboxConfig')>()),
  waitForSkillEditorReady: async () => {},
  buildBaseContainerEnv: () => ({}),
  disconnectFromProviderSandbox: async () => {},
  getProviderSandboxEndpoint: async () => ({
    host: 'editor.test',
    port: 44772,
    protocol: 'http',
    url: 'http://editor.test'
  })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getExistingSandboxClient: () => ({
    provider: {
      connectExisting: async () => true,
      getInfo: async () => ({
        id: 'original-provider',
        image: { repository: 'original' },
        entrypoint: ['/home/sandbox/entrypoint.sh'],
        status: { state: 'Running' }
      })
    },
    maintainWorkspace: mocks.maintain
  })
}));

describe('reset operation preserves draft recovery across transaction failures', () => {
  const teamId = new Types.ObjectId().toHexString();
  const tmbId = new Types.ObjectId().toHexString();
  let skillId: string;
  let currentVersionId: string;
  let baseVersionId: string;
  let instanceId: string;
  const reset = () =>
    resetEditWorkspace({
      skillId,
      teamId,
      expectedCurrentVersionId: currentVersionId,
      expectedBaseVersionId: baseVersionId,
      expectedOperationId: 'previous',
      confirmDiscard: true
    });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.mount.mockResolvedValue(undefined);
    const skill = await MongoAgentSkills.create({
      source: 'personal',
      name: 'Draft',
      author: '',
      description: '',
      category: [],
      config: {},
      teamId,
      tmbId
    });
    skillId = String(skill._id);
    const versions = await MongoAgentSkillsVersion.create(
      [0, 1].map((version) => ({
        skillId,
        tmbId,
        version,
        storage: { bucket: 'private', key: `v${version}.zip`, size: 1 }
      }))
    );
    baseVersionId = String(versions[0]._id);
    currentVersionId = String(versions[1]._id);
    await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId });
    const instance = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'reset-logical',
      status: 'running',
      sourceType: 'skillEdit',
      sourceId: skillId,
      teamId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      baseVersionId,
      workspaceGeneration: 'original-generation',
      operation: {
        id: 'previous',
        type: 'editInitialize',
        checkpoint: 'ready',
        startedAt: new Date(),
        updatedAt: new Date()
      },
      metadata: {
        sandboxType: 'edit-debug',
        skillId,
        teamId,
        workspaceRoot: '/workspace/edit',
        providerSandboxId: 'original-provider',
        volumeEnabled: true
      },
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', mountPath: '/workspace', claimName: 'original-volume' }]
      }
    });
    instanceId = String(instance._id);
    mocks.download.mockResolvedValue(
      await createSkillPackage({
        name: 'draft',
        skillMd: '---\nname: draft\ndescription: Published\n---\n'
      })
    );
    mocks.exchange.mockImplementation(async ({ resetId }) => ({
      backupRoot: `/workspace/.skill-edit-reset-${resetId}`
    }));
    mocks.maintain.mockImplementation(
      async (options: Parameters<SandboxClient['maintainWorkspace']>[0]) => {
        const claimed = await MongoSandboxInstance.findById(instanceId).lean();
        expect(claimed?.workspaceGeneration).not.toBe('original-generation');
        expect(claimed?.status).toBe('provisioning');
        await options.maintain({} as Parameters<typeof options.maintain>[0]);
        const committed = await MongoSandboxInstance.findById(instanceId).lean();
        expect(String(committed?.baseVersionId)).toBe(currentVersionId);
        expect(committed?.operation?.checkpoint).toBe('baseline_committed');
        return {};
      }
    );
  });

  it('commits a new baseline before making the editor running', async () => {
    const result = await reset();
    expect(result.workspace).toMatchObject({
      baseVersionId: currentVersionId,
      status: 'running',
      stale: false
    });
    expect(result.workspace.generation).not.toBe('original-generation');
    const instance = await MongoSandboxInstance.findById(instanceId).lean();
    expect(instance?.metadata).toMatchObject({
      resetBackupRoot: `/workspace/.skill-edit-reset-${result.workspace.generation}`
    });
  });
  it('leaves the original generation and draft untouched if preflight cannot prove the volume', async () => {
    mocks.mount.mockRejectedValueOnce(new Error('unproven-volume'));
    await expect(reset()).rejects.toThrow('unproven-volume');
    expect(mocks.maintain).not.toHaveBeenCalled();
    expect((await MongoSandboxInstance.findById(instanceId).lean())?.workspaceGeneration).toBe(
      'original-generation'
    );
  });
  it('refuses to claim an outdated current version after the preflight', async () => {
    mocks.mount.mockImplementationOnce(async () => {
      await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: baseVersionId });
    });
    await expect(reset()).rejects.toThrow('versionConflict');
    expect(mocks.maintain).not.toHaveBeenCalled();
    expect((await MongoSandboxInstance.findById(instanceId).lean())?.workspaceGeneration).toBe(
      'original-generation'
    );
  });
  it('keeps the old draft recovery path and blocks automatic retry after an unknown swap', async () => {
    mocks.exchange.mockRejectedValueOnce(new Error('remote-timeout'));
    await expect(reset()).rejects.toThrow('remote-timeout');
    const failed = await MongoSandboxInstance.findById(instanceId).lean();
    expect(String(failed?.baseVersionId)).toBe(baseVersionId);
    expect(failed?.operation?.failureDisposition).toBe('unknown');
    expect(failed?.metadata).toMatchObject({
      resetBackupRoot: `/workspace/.skill-edit-reset-${failed?.workspaceGeneration}`
    });
    await expect(reset()).rejects.toThrow('workspace_reset_unavailable');
    expect(mocks.exchange).toHaveBeenCalledOnce();
  });
  it('does not commit a baseline or start an editor if the current version changes after exchange', async () => {
    mocks.exchange.mockImplementationOnce(async ({ resetId }) => {
      await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: baseVersionId });
      return { backupRoot: `/workspace/.skill-edit-reset-${resetId}` };
    });
    await expect(reset()).rejects.toThrow('versionConflict');
    const failed = await MongoSandboxInstance.findById(instanceId).lean();
    expect(String(failed?.baseVersionId)).toBe(baseVersionId);
    expect(failed?.status).toBe('failed');
    expect(failed?.operation?.checkpoint).toBe('workspace_exchanged');
  });
});
