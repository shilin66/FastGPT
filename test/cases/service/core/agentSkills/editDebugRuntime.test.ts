import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getUser } from '@test/datas/users';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { runEditDebugSandboxTool } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle';
import type { AgentSandboxContext } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/types';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

vi.mock('@fastgpt/service/core/ai/sandbox/lease', () => ({
  withSandboxLease: async (_key: string, execute: (lease: SandboxLease) => Promise<unknown>) =>
    execute({ token: randomUUID(), assertOwned: async () => {}, setHeartbeat: vi.fn() })
}));

describe('Skill Edit debug workspace fencing', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let context: AgentSandboxContext;
  beforeEach(async () => {
    owner = await getUser('edit-debug-owner');
    const skill = await MongoAgentSkills.create({
      name: 'editor',
      source: 'personal',
      creationStatus: 'ready',
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    skillId = String(skill._id);
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'edit-workspace',
      sourceType: 'skillEdit',
      sourceId: skillId,
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      teamId: owner.teamId,
      status: 'running',
      workspaceGeneration: 'generation-1',
      metadata: { sandboxType: SandboxTypeEnum.editDebug, skillId, teamId: owner.teamId },
      operation: {
        id: 'initialize',
        type: 'editInitialize',
        checkpoint: 'ready',
        startedAt: new Date(),
        updatedAt: new Date()
      }
    });
    context = {
      sandboxId: 'edit-workspace',
      sandbox: { provider: 'opensandbox' },
      workspaceGeneration: 'generation-1'
    } as AgentSandboxContext;
  });
  const execute = (action: () => Promise<string>, tmbId = owner.tmbId) =>
    runEditDebugSandboxTool({
      context,
      skillId,
      teamId: owner.teamId,
      tmbId,
      execute: action
    });
  it('holds a persisted operation while executing and permits subsequent successful tools', async () => {
    const action = async () => {
      expect(
        await MongoSandboxInstance.findOne({ sandboxId: context.sandboxId }).lean()
      ).toMatchObject({
        status: 'provisioning',
        operation: { type: 'debug', checkpoint: 'executing', failureDisposition: 'unknown' }
      });
      return 'done';
    };
    expect(await execute(action)).toBe('done');
    expect(await execute(action)).toBe('done');
    expect(
      await MongoSandboxInstance.findOne({ sandboxId: context.sandboxId }).lean()
    ).toMatchObject({
      status: 'running',
      operation: { type: 'debug', checkpoint: 'ready', failureDisposition: 'retryable' }
    });
  });
  it('rejects an old debug context after workspace reset before executing', async () => {
    await MongoSandboxInstance.updateOne(
      { sandboxId: context.sandboxId },
      { workspaceGeneration: 'generation-2' }
    );
    const action = vi.fn().mockResolvedValue('unexpected');
    await expect(execute(action)).rejects.toThrow('sandbox_unavailable');
    expect(action).not.toHaveBeenCalled();
  });
  it('rechecks Write on every tool and rejects a same-team unauthorized member', async () => {
    const member = await getUser('edit-debug-member', owner.teamId);
    const action = vi.fn().mockResolvedValue('unexpected');
    await expect(execute(action, member.tmbId)).rejects.toBeDefined();
    expect(action).not.toHaveBeenCalled();
  });
  it('retains unknown remote failures and refuses a second automatic execution', async () => {
    const action = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('private endpoint'), { code: 'ECONNRESET' }));
    await expect(execute(action)).rejects.toThrow('sandbox_unavailable');
    await expect(execute(action)).rejects.toThrow('sandbox_unavailable');
    expect(action).toHaveBeenCalledTimes(1);
    expect(
      await MongoSandboxInstance.findOne({ sandboxId: context.sandboxId }).lean()
    ).toMatchObject({
      status: 'failed',
      operation: { failureDisposition: 'unknown', error: { code: 'sandbox_unavailable' } }
    });
  });
});
