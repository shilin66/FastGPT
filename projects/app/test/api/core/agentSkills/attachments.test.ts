import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import postHandler from '@/pages/api/core/chat/file/presignChatFilePostUrl';
import getHandler from '@/pages/api/core/chat/file/presignChatFileGetUrl';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  session: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  appAuth: vi.fn(),
  frequency: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (callback: unknown) => callback }));
vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({ authSkill: mocks.auth }));
vi.mock('@fastgpt/service/core/agentSkills/chat', () => ({
  assertSkillChatSession: mocks.session
}));
vi.mock('@/service/support/permission/auth/chat', () => ({ authChatCrud: mocks.appAuth }));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    createUploadChatFileURL: mocks.upload,
    createGetChatFileURL: mocks.download
  })
}));
vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: async () => ({ standard: { maxUploadFileSize: 2 } })
}));
vi.mock('@fastgpt/service/common/system/frequencyLimit/utils', () => ({
  authFrequencyLimit: mocks.frequency
}));

const skillId = '111111111111111111111111';
const body = {
  sourceType: 'skillEdit',
  appId: skillId,
  chatId: 'chat',
  filename: 'sample.txt',
  key: `chat/${skillId}/member/chat/sample.txt`
};
const request = (overrides: Record<string, unknown> = {}) =>
  ({ body: { ...body, ...overrides }, headers: {} }) as NextApiRequest;
const response = {} as NextApiResponse;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ teamId: 'team', tmbId: 'member' });
  mocks.session.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({ url: 'https://files.example.test/put' });
  mocks.download.mockResolvedValue({ url: 'https://files.example.test/get' });
});

describe('Skill chat attachment API authorization', () => {
  it('uses Skill write permission and the server document policy, not client extensions', async () => {
    await postHandler(
      request({
        fileSelectConfig: { canSelectCustomFileExtension: true, customFileExtensionList: ['.exe'] }
      }),
      response
    );
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({ skillId, per: WritePermissionVal })
    );
    expect(mocks.session).toHaveBeenCalledWith({ skillId, teamId: 'team', chatId: 'chat' });
    expect(mocks.appAuth).not.toHaveBeenCalled();
    const upload = mocks.upload.mock.calls[0][0];
    expect(upload).toMatchObject({ appId: skillId, chatId: 'chat', uId: 'member', maxFileSize: 2 });
    expect(upload.allowedExtensions).toContain('.txt');
    expect(upload.allowedExtensions).not.toContain('.exe');
  });
  it.each([postHandler, getHandler])(
    'denies read-only or cross-team access before signing',
    async (handler) => {
      mocks.auth.mockRejectedValueOnce(new Error('permission_denied'));
      await expect(handler(request(), response)).rejects.toThrow('permission_denied');
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.download).not.toHaveBeenCalled();
    }
  );
  it('denies an ambiguous chat identity before upload', async () => {
    mocks.session.mockRejectedValueOnce(new Error('ambiguous_source'));
    await expect(postHandler(request(), response)).rejects.toThrow('ambiguous_source');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('signs only current uploader and conversation files', async () => {
    await getHandler(request(), response);
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ key: body.key }));
    mocks.download.mockClear();
    await expect(
      getHandler(request({ key: `chat/${skillId}/other/chat/sample.txt` }), response)
    ).rejects.toThrow('scope');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
