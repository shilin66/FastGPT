import { beforeEach, describe, expect, it, vi } from 'vitest';
import detail from '@/pages/api/core/agentSkills/detail';
import reset from '@/pages/api/core/agentSkills/reset-workspace';
import {
  ManagePermissionVal,
  OwnerRoleVal,
  ReadRoleVal,
  WritePermissionVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { SkillPermission } from '@fastgpt/global/support/permission/agentSkill/controller';
import { GetSkillDetailResponseSchema } from '@fastgpt/global/openapi/core/agentSkills/api';
import { Types } from '@fastgpt/service/common/mongo';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), state: vi.fn(), reset: vi.fn(), count: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({ authSkill: mocks.auth }));
vi.mock('@fastgpt/service/core/agentSkills/editWorkspace/service', () => ({
  getEditWorkspaceState: mocks.state,
  resetEditWorkspace: mocks.reset
}));
vi.mock('@fastgpt/service/core/app/schema', () => ({ MongoApp: { countDocuments: mocks.count } }));

describe('Edit workspace API authorization', () => {
  const skillId = new Types.ObjectId().toHexString();
  const currentVersionId = new Types.ObjectId().toHexString();
  const workspace = {
    status: 'running',
    baseVersionId: currentVersionId,
    currentVersionId,
    stale: false,
    resetAvailable: true
  };
  const body = {
    skillId,
    expectedCurrentVersionId: currentVersionId,
    expectedBaseVersionId: currentVersionId,
    expectedOperationId: 'last-operation',
    confirmDiscard: true
  };
  const invokeDetail = detail as unknown as (req: {
    query: { skillId: string };
  }) => Promise<Record<string, unknown>>;
  const invokeReset = reset as unknown as (req: { body: object }) => Promise<unknown>;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.state.mockResolvedValue(workspace);
    mocks.reset.mockResolvedValue({ workspace });
    mocks.auth.mockResolvedValue({
      teamId: 'team',
      skill: {
        _id: new Types.ObjectId(skillId),
        source: 'personal',
        name: 'Draft',
        description: '',
        author: '',
        category: [],
        config: {},
        teamId: 'team'
      },
      permission: new SkillPermission({ role: ReadRoleVal })
    });
  });

  it('does not query or disclose workspace state to a Read-only caller', async () => {
    const result = await invokeDetail({ query: { skillId } });
    expect(result.workspace).toBeUndefined();
    expect(mocks.state).not.toHaveBeenCalled();
    expect(result._id).toBe(skillId);
  });

  it('projects a minimized empty Mongo configuration as an empty object', async () => {
    const auth = await mocks.auth();
    delete auth.skill.config;
    mocks.auth.mockResolvedValue(auth);
    expect((await invokeDetail({ query: { skillId } })).config).toEqual({});
  });

  it('returns workspace state only when Write is granted', async () => {
    const auth = await mocks.auth();
    auth.permission = new SkillPermission({ role: WriteRoleVal });
    mocks.auth.mockResolvedValue(auth);
    expect((await invokeDetail({ query: { skillId } })).workspace).toEqual(workspace);
  });

  it.each([ReadRoleVal, WriteRoleVal, OwnerRoleVal])(
    'returns numeric role %s that preserves client permission checks',
    async (role) => {
      const auth = await mocks.auth();
      const permission = new SkillPermission({ role });
      mocks.auth.mockResolvedValue({ ...auth, permission });
      const result = await invokeDetail({ query: { skillId } });
      expect(result.permission).toBe(role);
      const parsed = GetSkillDetailResponseSchema.parse(result);
      expect(new SkillPermission({ role: parsed.permission }).checkPer(WritePermissionVal)).toBe(
        permission.checkPer(WritePermissionVal)
      );
    }
  );

  it('rejects object and fractional permission representations at the response boundary', async () => {
    const result = await invokeDetail({ query: { skillId } });
    for (const permission of [new SkillPermission({ role: ReadRoleVal }), 1.5]) {
      expect(GetSkillDetailResponseSchema.safeParse({ ...result, permission }).success).toBe(false);
    }
  });

  it('requires explicit discard confirmation before any reset operation', async () => {
    await expect(invokeReset({ body: { ...body, confirmDiscard: false } })).rejects.toThrow();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('requires Manage independently of reset capability and forwards exact expectations', async () => {
    await invokeReset({ body });
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({ skillId, per: ManagePermissionVal })
    );
    expect(mocks.reset).toHaveBeenCalledWith({ ...body, teamId: 'team' });
    mocks.auth.mockRejectedValue(new Error('no-manage'));
    await expect(invokeReset({ body })).rejects.toThrow('no-manage');
    expect(mocks.reset).toHaveBeenCalledOnce();
  });
});
