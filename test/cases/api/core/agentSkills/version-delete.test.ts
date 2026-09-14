import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import handler from '@/pages/api/core/agentSkills/version/delete';

const mocks = vi.hoisted(() => ({
  authSkill: vi.fn(),
  mongoSessionRun: vi.fn(),
  addCleanupJob: vi.fn(),
  softDeleteVersionById: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (nextHandler: unknown) => nextHandler
}));

vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({
  authSkill: mocks.authSkill
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

vi.mock('@fastgpt/service/core/agentSkills/version/cleanup', () => ({
  addAgentSkillVersionCleanupJob: mocks.addCleanupJob
}));

vi.mock('@fastgpt/service/core/agentSkills/version/controller', () => ({
  softDeleteVersionById: mocks.softDeleteVersionById
}));

describe('POST /api/core/agentSkills/version/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSkill.mockResolvedValue({});
    mocks.addCleanupJob.mockResolvedValue(undefined);
    mocks.mongoSessionRun.mockImplementation(async (callback: (session: object) => unknown) =>
      callback({})
    );
  });

  it('requires Manage permission for version deletion', async () => {
    const invoke = handler as unknown as (request: {
      body: { skillId: string; versionId: string };
    }) => Promise<unknown>;
    await invoke({ body: { skillId: 'skill-id', versionId: 'version-id' } });

    expect(mocks.authSkill).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'skill-id', per: ManagePermissionVal })
    );
  });
});
