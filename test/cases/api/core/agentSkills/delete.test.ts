import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import handler from '@/pages/api/core/agentSkills/delete';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
  mark: vi.fn(),
  enqueue: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (next: unknown) => next }));
vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({ authSkill: mocks.auth }));
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({ mongoSessionRun: mocks.transaction }));
vi.mock('@fastgpt/service/core/agentSkills/controller', () => ({ deleteSkill: mocks.mark }));
vi.mock('@fastgpt/service/core/agentSkills/delete', () => ({
  addAgentSkillDeleteJob: mocks.enqueue
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn(),
  getI18nSkillType: vi.fn()
}));

describe('DELETE /api/core/agentSkills/delete', () => {
  const skillId = '507f1f77bcf86cd799439011';
  const invoke = handler as unknown as (request: {
    query: { skillId: string };
  }) => Promise<unknown>;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      teamId: 'team',
      tmbId: 'member',
      skill: { name: 'Skill', type: 'skill' }
    });
    mocks.mark.mockResolvedValue({ operationId: 'committed-operation' });
    mocks.transaction.mockImplementation(async (callback: (session: object) => Promise<unknown>) =>
      callback({})
    );
  });
  it('allows Manage members and enqueues only the committed operation', async () => {
    await invoke({ query: { skillId } });
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({ skillId, per: ManagePermissionVal })
    );
    expect(mocks.enqueue).toHaveBeenCalledWith({ operationId: 'committed-operation' });
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueue.mock.invocationCallOrder[0]
    );
  });
  it('never enqueues a rolled-back marking transaction', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('transaction aborted'));
    await expect(invoke({ query: { skillId } })).rejects.toThrow('transaction aborted');
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('does not mark any resource if authorization fails', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('forbidden'));
    await expect(invoke({ query: { skillId } })).rejects.toThrow('forbidden');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
