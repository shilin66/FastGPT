import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/app/version/publish';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  resolveRuntimeSkills: vi.fn(),
  getAppRuntimeSkillIds: vi.fn(),
  createVersion: vi.fn(),
  updateVersion: vi.fn(),
  updateApp: vi.fn(),
  updateParent: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (callback: unknown) => callback }));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({ authApp: mocks.authApp }));
vi.mock('@fastgpt/service/core/agentSkills/runtimeResolver', () => ({
  resolveRuntimeSkills: mocks.resolveRuntimeSkills,
  getAppRuntimeSkillIds: mocks.getAppRuntimeSkillIds
}));
vi.mock('@fastgpt/service/core/app/version/schema', () => ({
  MongoAppVersion: { create: mocks.createVersion, updateOne: mocks.updateVersion }
}));
vi.mock('@fastgpt/service/core/app/schema', () => ({ MongoApp: { updateOne: mocks.updateApp } }));
vi.mock('@fastgpt/service/core/app/controller', () => ({
  beforeUpdateAppFormat: vi.fn(),
  updateParentFoldersUpdateTime: mocks.updateParent
}));
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: async (callback: (session: object) => Promise<void>) => callback({})
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn(),
  getI18nAppType: vi.fn()
}));

describe('App publication Skill gate', () => {
  const invoke = handler as unknown as (request: {
    query: { appId: string };
    body: { nodes: []; edges: []; isPublish?: boolean; autoSave?: boolean };
  }) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authApp.mockResolvedValue({
      app: { _id: 'app', tmbId: 'owner', teamId: 'team', name: 'app' },
      tmbId: 'editor',
      teamId: 'team'
    });
    mocks.getAppRuntimeSkillIds.mockReturnValue(['selected-skill']);
    mocks.resolveRuntimeSkills.mockResolvedValue([]);
    mocks.createVersion.mockResolvedValue([{ _id: 'new-version' }]);
    mocks.updateVersion.mockResolvedValue({});
    mocks.updateApp.mockResolvedValue({});
  });

  it('rejects unusable Skills before any App, Version or folder write', async () => {
    mocks.resolveRuntimeSkills.mockRejectedValue(new Error('skill_unavailable'));
    await expect(
      invoke({ query: { appId: 'app' }, body: { nodes: [], edges: [], isPublish: true } })
    ).rejects.toThrow('skill_unavailable');
    expect(mocks.createVersion).not.toHaveBeenCalled();
    expect(mocks.updateApp).not.toHaveBeenCalled();
    expect(mocks.updateParent).not.toHaveBeenCalled();
  });

  it('checks the App owner rather than the publishing editor, including package existence', async () => {
    await invoke({ query: { appId: 'app' }, body: { nodes: [], edges: [], isPublish: true } });
    expect(mocks.resolveRuntimeSkills).toHaveBeenCalledWith({
      skillIds: ['selected-skill'],
      teamId: 'team',
      tmbId: 'owner',
      validatePackages: true
    });
    expect(mocks.createVersion).toHaveBeenCalledTimes(1);
    expect(mocks.updateApp).toHaveBeenCalledTimes(1);
  });

  it.each([{ isPublish: false }, { isPublish: true, autoSave: true }])(
    'allows saving an unfinished draft %j without treating it as a release',
    async (flags) => {
      mocks.resolveRuntimeSkills.mockRejectedValue(new Error('skill_unavailable'));
      await invoke({ query: { appId: 'app' }, body: { nodes: [], edges: [], ...flags } });
      expect(mocks.resolveRuntimeSkills).not.toHaveBeenCalled();
      expect(mocks.updateApp).toHaveBeenCalledTimes(1);
    }
  );
});
