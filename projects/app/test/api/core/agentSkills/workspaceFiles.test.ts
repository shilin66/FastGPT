import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/core/agentSkills/files';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolve: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  operate: vi.fn(),
  lease: vi.fn(),
  run: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (callback: unknown) => callback }));
vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({ authSkill: mocks.auth }));
vi.mock('@fastgpt/service/core/agentSkills/editWorkspace/entity', () => ({
  resolveEditWorkspace: mocks.resolve
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getExistingSandboxClient: () => ({ provider: { connectExisting: mocks.connect } })
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', () => ({
  disconnectFromProviderSandbox: mocks.close,
  getSkillEditWorkspaceRoot: () => '/workspace/edit'
}));
vi.mock('@fastgpt/service/core/agentSkills/editWorkspace/files', () => ({
  operateSkillWorkspaceFiles: mocks.operate
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', () => ({ withSandboxLease: mocks.lease }));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle', () => ({
  runEditDebugSandboxTool: mocks.run
}));

const skillId = '111111111111111111111111';
const req = (body = {}) => ({ body: { skillId, action: 'list', ...body } }) as NextApiRequest;
const res = {} as NextApiResponse;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ teamId: 'team', tmbId: 'member' });
  mocks.resolve.mockResolvedValue({ _id: 'instance', sandboxId: 'sandbox', status: 'running' });
  mocks.connect.mockResolvedValue(true);
  mocks.operate.mockResolvedValue({ action: 'list', files: [], truncated: false });
  mocks.lease.mockImplementation(async (_key: string, run: () => Promise<unknown>) => run());
  mocks.run.mockImplementation(async ({ execute }: { execute: () => Promise<unknown> }) =>
    execute()
  );
});

describe('Skill workspace file API boundary', () => {
  it('denies read-only users before accessing the provider', async () => {
    mocks.auth.mockRejectedValue(new Error('permission_denied'));
    await expect(handler(req(), res)).rejects.toThrow('permission_denied');
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({ skillId, per: WritePermissionVal })
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('uses the authorized team and rejects unavailable workspaces', async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(handler(req(), res)).rejects.toThrow('workspace_not_running');
    expect(mocks.resolve).toHaveBeenCalledWith({ skillId, teamId: 'team' });
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('can poll files during debug but not during publish', async () => {
    mocks.resolve.mockResolvedValue({ status: 'provisioning', operation: { type: 'debug' } });
    await expect(handler(req(), res)).resolves.toMatchObject({ action: 'list' });
    expect(mocks.close).toHaveBeenCalledOnce();
    mocks.resolve.mockResolvedValue({ status: 'provisioning', operation: { type: 'publish' } });
    await expect(handler(req(), res)).rejects.toThrow('workspace_not_running');
  });
  it('serializes writes with the model round and closes on conflict without overwriting', async () => {
    mocks.lease.mockRejectedValue(new Error('operation_conflict'));
    await expect(
      handler(
        req({
          action: 'write',
          path: 'skills/demo/SKILL.md',
          content: 'draft',
          expectedHash: 'a'.repeat(64)
        }),
        res
      )
    ).rejects.toThrow('operation_conflict');
    expect(mocks.lease).toHaveBeenCalledWith(
      `skill-edit-activity:${skillId}`,
      expect.any(Function)
    );
    expect(mocks.operate).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
