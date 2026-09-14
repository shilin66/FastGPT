import { describe, expect, it, vi } from 'vitest';
import { claimEditWorkspace } from '@fastgpt/service/core/agentSkills/editWorkspace/entity';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { Types } from '@fastgpt/service/common/mongo';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import { assertEditWorkspacePersistentMount } from '@fastgpt/service/core/agentSkills/sandboxWorkspace';

describe('Edit reset fencing', () => {
  const lease: SandboxLease = {
    token: 'reset-claim',
    assertOwned: vi.fn(async () => {}),
    setHeartbeat: vi.fn()
  };
  const create = () =>
    MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: `reset-${new Types.ObjectId()}`,
      status: 'running',
      baseVersionId: new Types.ObjectId(),
      workspaceGeneration: 'old-generation',
      operation: {
        id: 'old-op',
        type: 'editInitialize',
        checkpoint: 'ready',
        startedAt: new Date(),
        updatedAt: new Date()
      }
    });

  it('changes generation in the atomic claim before any remote work', async () => {
    const doc = await create();
    const operation = await claimEditWorkspace({
      instance: doc.toObject(),
      lease,
      type: 'resetWorkspace'
    });
    const current = await MongoSandboxInstance.findById(doc._id).lean();
    expect(current?.workspaceGeneration).toMatch(/^[a-f0-9-]{36}$/);
    expect(current?.workspaceGeneration).not.toBe('old-generation');
    expect(current?.operation).toMatchObject({ type: 'resetWorkspace', checkpoint: 'claimed' });
    await expect(
      claimEditWorkspace({ instance: doc.toObject(), lease, type: 'resetWorkspace' })
    ).rejects.toThrow();
    await operation.assertActive();
  });

  it('retains the new generation and unknown disposition after an uncertain remote operation', async () => {
    const doc = await create();
    const operation = await claimEditWorkspace({
      instance: doc.toObject(),
      lease,
      type: 'resetWorkspace'
    });
    await expect(
      operation.remoteEffect(async () => {
        throw new Error('timeout');
      })
    ).rejects.toThrow('timeout');
    await operation.fail();
    const current = await MongoSandboxInstance.findById(doc._id).lean();
    expect(current?.workspaceGeneration).toBe(operation.instance.workspaceGeneration);
    expect(current?.operation?.failureDisposition).toBe('unknown');
    expect(String(current?.baseVersionId)).toBe(String(doc.baseVersionId));
    expect(current?.status).toBe('failed');
  });

  it('requires the exact persisted volume and refuses a missing proof', async () => {
    const provider = { execute: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })) };
    await expect(
      assertEditWorkspacePersistentMount({
        provider,
        workDirectory: '/workspace/edit',
        mountPath: '/workspace',
        claimName: 'pvc-one',
        assertActive: async () => {}
      })
    ).rejects.toThrow();
    expect(provider.execute).toHaveBeenCalledOnce();
  });
});
