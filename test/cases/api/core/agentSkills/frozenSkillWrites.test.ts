import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUser } from '@test/datas/users';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { setTeamStatusCache } from '@fastgpt/service/support/user/team/status';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { ManageRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreateRoleVal } from '@fastgpt/global/support/permission/user/constant';
import * as authCommon from '@fastgpt/service/support/permission/auth/common';
import create from '@/pages/api/core/agentSkills/create';
import createFolder from '@/pages/api/core/agentSkills/folder/create';
import update from '@/pages/api/core/agentSkills/update';
import importSkill from '@/pages/api/core/agentSkills/import';

vi.mock('@fastgpt/service/support/permission/auth/common', async (original) => await original());
const mocks = vi.hoisted(() => ({ write: vi.fn(), upload: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/core/agentSkills/controller', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/agentSkills/controller')>()),
  checkSkillNameExists: async () => false,
  createSkill: mocks.write,
  createSkillFolder: mocks.write,
  updateSkill: mocks.write
}));
vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: { resolveFormData: mocks.upload, clearDiskTempFiles: vi.fn() }
}));

type InvokeWrite = (req: {
  headers: { token: string };
  body: { skillId: string; name: string; parentId?: null };
}) => Promise<unknown>;

describe('Skill write actions with non-write initial ACL requests', () => {
  let skillId: string;
  let member: Awaited<ReturnType<typeof getUser>>;
  const request = () => ({
    headers: { token: 'local-skill-write-session' },
    body: { skillId, name: 'New name' }
  });
  const setStatus = async (status: 'active' | 'frozen') => {
    await MongoTeam.updateOne({ _id: member.teamId }, { status });
    await setTeamStatusCache(member.teamId, status);
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    const owner = await getUser('skill-write-owner');
    member = await getUser('skill-writer', owner.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'Existing draft',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      source: 'personal'
    });
    skillId = String(skill._id);
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: skillId,
        teamId: owner.teamId,
        tmbId: member.tmbId,
        permission: ManageRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.team,
        resourceId: null,
        teamId: owner.teamId,
        tmbId: member.tmbId,
        permission: TeamSkillCreateRoleVal
      }
    ]);
    await setStatus('frozen');
    const session = {
      userId: member.userId,
      teamId: member.teamId,
      tmbId: member.tmbId,
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
    mocks.write.mockRejectedValue(new Error('write boundary reached'));
    mocks.upload.mockRejectedValue(new Error('upload boundary reached'));
  });

  it.each([
    ['root Skill creation', create],
    ['root folder creation', createFolder],
    ['ordinary metadata update', update]
  ])('rejects frozen %s before its write service', async (_name, handler) => {
    await expect((handler as unknown as InvokeWrite)(request())).rejects.toThrow('团队已冻结');
    expect(mocks.write).not.toHaveBeenCalled();
    expect(await MongoAgentSkills.countDocuments({ teamId: member.teamId })).toBe(1);
    expect((await MongoAgentSkills.findById(skillId).lean())?.name).toBe('Existing draft');
  });

  it.each([
    ['root Skill creation', create],
    ['root folder creation', createFolder],
    ['ordinary metadata update', update]
  ])('retains the existing ACL for active %s', async (_name, handler) => {
    await setStatus('active');
    await expect((handler as unknown as InvokeWrite)(request())).rejects.toThrow(
      'write boundary reached'
    );
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it('rejects a frozen import before consuming multipart data', async () => {
    await expect((importSkill as unknown as InvokeWrite)(request())).rejects.toThrow('团队已冻结');
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('allows an active import to continue to multipart validation', async () => {
    await setStatus('active');
    await expect((importSkill as unknown as InvokeWrite)(request())).rejects.toThrow(
      'upload boundary reached'
    );
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it('does not replace the root Skill creation ACL with a generic Write role', async () => {
    await setStatus('active');
    await MongoResourcePermission.deleteMany({
      resourceType: PerResourceTypeEnum.team,
      teamId: member.teamId,
      tmbId: member.tmbId
    });
    await expect((create as unknown as InvokeWrite)(request())).rejects.toBeDefined();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
