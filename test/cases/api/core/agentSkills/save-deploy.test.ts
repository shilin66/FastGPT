import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import handler from '@/pages/api/core/agentSkills/save-deploy';

const mocks = vi.hoisted(() => ({
  authSkill: vi.fn(),
  findSandbox: vi.fn(),
  packageSkillInSandbox: vi.fn(),
  publishSkillPackage: vi.fn(),
  publishEditWorkspace: vi.fn(),
  addAuditLog: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (nextHandler: unknown) => nextHandler
}));

vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({
  authSkill: mocks.authSkill
}));

vi.mock('@fastgpt/service/core/ai/sandbox/schema', () => ({
  MongoSandboxInstance: {
    findOne: mocks.findSandbox
  }
}));

vi.mock('@fastgpt/service/core/agentSkills/sandboxController', () => ({
  packageSkillInSandbox: mocks.packageSkillInSandbox
}));

vi.mock('@fastgpt/service/core/agentSkills/version/publish', () => ({
  publishSkillPackage: mocks.publishSkillPackage
}));
vi.mock('@fastgpt/service/core/agentSkills/editWorkspace/service', () => ({
  publishEditWorkspace: mocks.publishEditWorkspace
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mocks.addAuditLog,
  getI18nSkillType: vi.fn(() => 'skill')
}));

describe('POST /api/core/agentSkills/save-deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes through the shared Edit operation with the caller version expectations', async () => {
    const skillId = '507f1f77bcf86cd799439011';
    mocks.authSkill.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      skill: {
        name: 'test-skill',
        type: 'team',
        currentVersionId: '507f191e810c19729de860ea'
      }
    });
    mocks.publishEditWorkspace.mockResolvedValue({
      skillId,
      versionId: '507f191e810c19729de860eb',
      version: 1,
      versionName: 'v1',
      storage: { bucket: 'bucket', key: 'key', size: 7 },
      createdAt: '2026-08-31T00:00:00.000Z',
      workspace: {
        status: 'running',
        baseVersionId: '507f191e810c19729de860eb',
        currentVersionId: '507f191e810c19729de860eb',
        stale: false,
        resetAvailable: false
      }
    });

    const invoke = handler as unknown as (request: {
      body: {
        skillId: string;
        versionName: string;
        expectedCurrentVersionId: string;
        expectedBaseVersionId: null;
      };
    }) => Promise<unknown>;
    const body = {
      skillId,
      versionName: 'v1',
      expectedCurrentVersionId: '507f191e810c19729de860ea',
      expectedBaseVersionId: null
    };
    await invoke({ body });

    expect(mocks.authSkill).toHaveBeenCalledWith(
      expect.objectContaining({ per: WritePermissionVal })
    );
    expect(mocks.publishEditWorkspace).toHaveBeenCalledWith({
      ...body,
      teamId: 'team-id',
      tmbId: 'tmb-id'
    });
  });
});
