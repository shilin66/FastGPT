import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionError } from '@fastgpt-sdk/sandbox-adapter';
import { SandboxToolIds } from '@fastgpt/global/core/workflow/node/agent/skillTools';
import { createSandboxSkillsCapability } from '../../../../../../../core/workflow/dispatch/ai/agent/capability/sandboxSkills';
import { SandboxUnavailableError } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/errors';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  create: vi.fn(),
  execute: vi.fn(),
  edit: vi.fn()
}));
vi.mock('@fastgpt/service/core/agentSkills/runtimeResolver', () => ({
  resolveRuntimeSkills: mocks.resolve,
  RuntimeSkillResolutionError: class extends Error {}
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox', () => ({
  createAgentSandbox: mocks.create,
  connectEditDebugSandbox: mocks.edit,
  releaseAgentSandbox: vi.fn(),
  disconnectEditDebugSandbox: vi.fn()
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/skill', () => ({
  dispatchSandboxExecute: mocks.execute,
  dispatchSandboxReadFile: vi.fn(),
  dispatchSandboxWriteFile: vi.fn(),
  dispatchSandboxEditFile: vi.fn(),
  dispatchSandboxSearch: vi.fn(),
  dispatchSandboxFetchUserFile: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/identity', () => ({
  resolveAppSandboxIdentity: vi.fn().mockResolvedValue({})
}));

describe('Runtime Skill capability failure and lazy resolution', () => {
  const params = {
    skillIds: ['a'.repeat(24)],
    appId: 'b'.repeat(24),
    runtimeUserId: 'visitor',
    teamId: 'c'.repeat(24),
    tmbId: 'd'.repeat(24),
    sessionId: 'chat',
    mode: 'sessionRuntime' as const,
    showSkillReferences: false,
    allFilesMap: {}
  };
  const execute = (capability: Awaited<ReturnType<typeof createSandboxSkillsCapability>>) =>
    capability.handleToolCall?.(SandboxToolIds.execute, '{"command":"touch result"}', 'call');
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue([
      {
        skill: { _id: params.skillIds[0], name: 'Private skill' },
        version: { _id: 'e'.repeat(24) },
        runtimeSkills: [{ name: 'lookup', description: 'Lookup', path: 'skills/lookup' }]
      }
    ]);
    mocks.create.mockResolvedValue({
      sandboxId: 'logical',
      operationId: 'deployment',
      sandbox: { provider: 'opensandbox' },
      deployedSkills: [],
      skills: [],
      workDirectory: '/workspace'
    });
    mocks.execute.mockResolvedValue({ response: 'Exit code: 1', usages: [] });
  });
  it('resolves owner metadata and pins the version without starting a container', async () => {
    const capability = await createSandboxSkillsCapability(params);
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ tmbId: params.tmbId, teamId: params.teamId })
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(capability.systemPrompt).toContain(
      '/.runtime/current/' + params.skillIds[0] + '/skills/lookup/SKILL.md'
    );
    await execute(capability);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersionIds: { [params.skillIds[0]]: 'e'.repeat(24) } })
    );
  });
  it('fails a bound App on initialization failure with a persistent safe audit event', async () => {
    mocks.create.mockRejectedValue(new Error('private provider credential'));
    const capability = await createSandboxSkillsCapability(params);
    try {
      await execute(capability);
      throw new Error('unexpected success');
    } catch (error) {
      expect(error).toBeInstanceOf(SandboxUnavailableError);
      expect(JSON.stringify(error)).not.toContain('private provider credential');
      expect(error).toMatchObject({
        assistantResponses: [{ sandboxEvent: { status: 'failed', code: 'sandbox_unavailable' } }]
      });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('degrades an unbound App once and disables further sandbox attempts', async () => {
    mocks.resolve.mockResolvedValue([]);
    mocks.create.mockRejectedValue(new Error('private provider credential'));
    const capability = await createSandboxSkillsCapability({ ...params, skillIds: [] });
    const result = await execute(capability);
    expect(result?.response).toContain('sandbox_unavailable');
    expect(result?.assistantResponses).toEqual([
      expect.objectContaining({ sandboxEvent: expect.objectContaining({ status: 'degraded' }) })
    ]);
    await execute(capability);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('never replays an execute with an unknown transport outcome', async () => {
    mocks.execute.mockRejectedValue(new ConnectionError('connection lost'));
    const capability = await createSandboxSkillsCapability(params);
    await expect(execute(capability)).rejects.toThrow('sandbox_unavailable');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('keeps a normal script nonzero result nonfatal', async () => {
    const capability = await createSandboxSkillsCapability(params);
    expect((await execute(capability))?.response).toBe('Exit code: 1');
  });
  it('validates tool arguments before any lazy sandbox side effect', async () => {
    const capability = await createSandboxSkillsCapability(params);
    const result = await capability.handleToolCall?.(
      SandboxToolIds.execute,
      '{"command":42}',
      'call'
    );
    expect(result?.response).toContain('string');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('restores paused version bindings and exposes the resolved snapshot for persistence', async () => {
    const versions = { [params.skillIds[0]]: 'e'.repeat(24) };
    const onResolvedVersionIds = vi.fn();
    await createSandboxSkillsCapability({
      ...params,
      expectedVersionIds: versions,
      onResolvedVersionIds
    });
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersionIds: versions })
    );
    expect(onResolvedVersionIds).toHaveBeenCalledWith(versions);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('fails Skill Edit initialization with the stable infrastructure error', async () => {
    mocks.edit.mockRejectedValue(new Error('private endpoint'));
    await expect(createSandboxSkillsCapability({ ...params, mode: 'editDebug' })).rejects.toThrow(
      'sandbox_unavailable'
    );
  });
});
