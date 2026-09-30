import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { getUser } from '@test/datas/users';
import { createSandboxSkillsCapability } from '@fastgpt/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills';
import { SandboxToolIds } from '@fastgpt/global/core/workflow/node/agent/skillTools';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';

const { createSandboxMock, connectEditMock, executeMock } = vi.hoisted(() => ({
  createSandboxMock: vi.fn(),
  connectEditMock: vi.fn(),
  executeMock: vi.fn()
}));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return { env: { ...original.env, AGENT_SANDBOX_PROVIDER: 'opensandbox' } };
});
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox', () => ({
  createAgentSandbox: createSandboxMock,
  connectEditDebugSandbox: connectEditMock,
  releaseAgentSandbox: vi.fn(),
  disconnectEditDebugSandbox: vi.fn()
}));
vi.mock(
  '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle')
    >()),
    runEditDebugSandboxTool: async ({ execute }: { execute: () => Promise<unknown> }) => execute()
  })
);
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/skill', () => ({
  dispatchSandboxExecute: executeMock,
  dispatchSandboxReadFile: vi.fn(),
  dispatchSandboxWriteFile: vi.fn(),
  dispatchSandboxEditFile: vi.fn(),
  dispatchSandboxSearch: vi.fn(),
  dispatchSandboxFetchUserFile: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/lease', () => ({
  withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<unknown>) =>
    run({
      token: randomUUID(),
      isActive: () => true,
      assertOwned: async () => {},
      setHeartbeat: vi.fn()
    })
}));

describe('Sandbox capability identity propagation', () => {
  const sandboxId = 'logical-key';
  const providerSandboxId = 'provider-container-id';
  const previousActiveAt = new Date('2020-01-01T00:00:00Z');
  const params = {
    appId: new Types.ObjectId().toHexString(),
    runtimeUserId: 'final-user',
    teamId: new Types.ObjectId().toHexString(),
    tmbId: new Types.ObjectId().toHexString(),
    sessionId: 'chat-session',
    skillIds: [],
    mode: 'sessionRuntime' as const,
    showSkillReferences: false,
    allFilesMap: {}
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const owner = await getUser('capability-owner');
    params.teamId = owner.teamId;
    params.tmbId = owner.tmbId;
    const context = {
      sandboxId,
      providerSandboxId,
      sessionId: params.sessionId,
      sandbox: { provider: 'opensandbox' },
      skills: [],
      deployedSkills: [],
      workDirectory: '/workspace',
      isReady: true
    };
    createSandboxMock.mockResolvedValue(context);
    connectEditMock.mockResolvedValue(context);
    executeMock.mockResolvedValue({ response: 'ok', usages: [] });
    await MongoSandboxInstance.create([
      { provider: 'opensandbox', sandboxId, lastActiveAt: previousActiveAt },
      { provider: 'opensandbox', sandboxId: providerSandboxId, lastActiveAt: previousActiveAt },
      { provider: 'sealosdevbox', sandboxId, lastActiveAt: previousActiveAt }
    ]);
  });

  it('passes the app and final user to lazy initialization without starting early', async () => {
    const capability = await createSandboxSkillsCapability(params);
    expect(createSandboxMock).not.toHaveBeenCalled();
    await capability.handleToolCall?.(
      SandboxToolIds.execute,
      JSON.stringify({ command: 'true' }),
      'call'
    );
    expect(createSandboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: params.appId,
        runtimeUserId: params.runtimeUserId,
        sessionId: params.sessionId
      })
    );
  });

  it('advertises stable resource-scoped paths for every runtime Skill before creating a sandbox', async () => {
    const skill = await MongoAgentSkills.create({
      teamId: params.teamId,
      tmbId: params.tmbId,
      name: 'resource display name',
      creationStatus: 'ready',
      source: AgentSkillSourceEnum.personal,
      currentRuntimeSkills: [
        { name: 'first', description: 'First runtime', path: 'skills/first' },
        { name: 'second', description: 'Second runtime', path: 'skills/second' }
      ]
    });
    const version = await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId: params.tmbId,
      version: 0,
      runtimeSkills: skill.currentRuntimeSkills,
      storage: { bucket: 'test', key: 'skill.zip', size: 100 }
    });
    await MongoAgentSkills.updateOne({ _id: skill._id }, { currentVersionId: version._id });
    const capability = await createSandboxSkillsCapability({
      ...params,
      skillIds: [String(skill._id)]
    });
    expect(capability.systemPrompt).toContain(
      '/.runtime/current/' + String(skill._id) + '/skills/first/SKILL.md'
    );
    expect(capability.systemPrompt).toContain(
      '/.runtime/current/' + String(skill._id) + '/skills/second/SKILL.md'
    );
    expect(createSandboxMock).not.toHaveBeenCalled();
  });

  it.each(['sessionRuntime', 'editDebug'] as const)(
    'renews only the logical %s record for its provider',
    async (mode) => {
      const capability = await createSandboxSkillsCapability({
        ...params,
        mode,
        skillIds: mode === 'editDebug' ? ['skill-id'] : []
      });
      await capability.handleToolCall?.(
        SandboxToolIds.execute,
        JSON.stringify({ command: 'true' }),
        'call'
      );
      await vi.waitFor(async () => {
        const record = await MongoSandboxInstance.findOne({
          provider: 'opensandbox',
          sandboxId
        }).lean();
        expect(record?.lastActiveAt.getTime()).toBeGreaterThan(previousActiveAt.getTime());
      });
      const decoys = await MongoSandboxInstance.find({
        $or: [{ sandboxId: providerSandboxId }, { provider: 'sealosdevbox', sandboxId }]
      }).lean();
      expect(decoys.map((record) => record.lastActiveAt)).toEqual([
        previousActiveAt,
        previousActiveAt
      ]);
    }
  );
});
