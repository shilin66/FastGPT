import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest } from 'next';
import { getUser } from '@test/datas/users';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { setTeamStatusCache } from '@fastgpt/service/support/user/team/status';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import {
  ManagePermissionVal,
  ManageRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authSkill, authSkillByTmbId } from '@fastgpt/service/support/permission/agentSkill/auth';
import type { ResetSkillWorkspaceBody } from '@fastgpt/global/openapi/core/agentSkills/api';
import reset from '@/pages/api/core/agentSkills/reset-workspace';
import * as authCommon from '@fastgpt/service/support/permission/auth/common';

vi.mock('@fastgpt/service/support/permission/auth/common', async (original) => await original());
const mocks = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/core/agentSkills/editWorkspace/service', () => ({
  resetEditWorkspace: mocks.reset
}));

describe('frozen team Skill write boundary', () => {
  let skillId: string;
  let manager: Awaited<ReturnType<typeof getUser>>;
  const req = { headers: { token: 'local-test-session' } } as unknown as NextApiRequest;
  const invokeReset = reset as unknown as (request: {
    headers: NextApiRequest['headers'];
    body: ResetSkillWorkspaceBody;
  }) => Promise<unknown>;
  const resetWorkspace = () =>
    invokeReset({
      headers: req.headers,
      body: {
        skillId,
        expectedCurrentVersionId: '333333333333333333333333',
        expectedBaseVersionId: '333333333333333333333333',
        expectedOperationId: 'ready',
        confirmDiscard: true
      }
    });
  const setStatus = async (status: 'active' | 'frozen') => {
    await MongoTeam.updateOne({ _id: manager.teamId }, { status });
    await setTeamStatusCache(manager.teamId, status);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    const owner = await getUser('frozen-workspace-owner');
    manager = await getUser('frozen-workspace-manager', owner.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'frozen-draft',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      source: 'personal',
      creationStatus: 'ready'
    });
    skillId = String(skill._id);
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      resourceId: skillId,
      teamId: owner.teamId,
      tmbId: manager.tmbId,
      permission: ManageRoleVal
    });
    await setStatus('frozen');
    const session = {
      userId: manager.userId,
      teamId: manager.teamId,
      tmbId: manager.tmbId,
      isRoot: '0',
      createdAt: String(Date.now())
    };
    vi.mocked(getGlobalRedisConnection().hgetall).mockResolvedValue(session);
    if (global.redisClient) vi.mocked(global.redisClient.hgetall).mockResolvedValue(session);
    const realAuth = await vi.importActual<typeof authCommon>(
      '@fastgpt/service/support/permission/auth/common'
    );
    const parseHeaderCert = realAuth.parseHeaderCert;
    vi.spyOn(authCommon, 'parseHeaderCert').mockImplementation(parseHeaderCert);
    await expect(authCommon.parseHeaderCert({ req, authToken: true })).resolves.toMatchObject({
      userId: manager.userId,
      teamId: manager.teamId,
      tmbId: manager.tmbId,
      isRoot: false
    });
    mocks.reset.mockResolvedValue({
      workspace: {
        status: 'running',
        baseVersionId: null,
        currentVersionId: null,
        stale: false,
        resetAvailable: true
      }
    });
  });

  it('rejects a valid frozen manager session before the destructive reset service', async () => {
    await expect(resetWorkspace()).rejects.toThrow('团队已冻结');
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it.each([WritePermissionVal, ManagePermissionVal])(
    'rejects frozen internal Skill access requesting permission %s',
    async (per) => {
      await expect(authSkillByTmbId({ skillId, tmbId: manager.tmbId, per })).rejects.toThrow(
        '团队已冻结'
      );
    }
  );

  it('does not use the root ACL shortcut to bypass the frozen write boundary', async () => {
    await expect(
      authSkillByTmbId({ skillId, tmbId: manager.tmbId, per: ManagePermissionVal, isRoot: true })
    ).rejects.toThrow('团队已冻结');
  });

  it('preserves Read access for frozen teams without granting a write request', async () => {
    const result = await authSkill({ req, skillId, per: ReadPermissionVal, authToken: true });
    expect(String(result.skill._id)).toBe(skillId);
    expect(result.permission.role).toBe(ManageRoleVal);
    expect(result.permission.checkPer(ReadPermissionVal)).toBe(true);
  });

  it('allows active managers to reset and use the internal Write boundary', async () => {
    await setStatus('active');
    await expect(resetWorkspace()).resolves.toHaveProperty('workspace');
    expect(mocks.reset).toHaveBeenCalledOnce();
    await expect(
      authSkillByTmbId({ skillId, tmbId: manager.tmbId, per: WritePermissionVal })
    ).resolves.toHaveProperty('skill');
  });

  it('continues to enforce the Skill ACL for an active team', async () => {
    await setStatus('active');
    await MongoResourcePermission.deleteMany({
      resourceType: PerResourceTypeEnum.agentSkill,
      resourceId: skillId
    });
    await expect(resetWorkspace()).rejects.toBeDefined();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
