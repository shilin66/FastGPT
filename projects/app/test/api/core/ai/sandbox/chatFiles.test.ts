import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findInstance: vi.fn(),
  getClient: vi.fn(),
  createClient: vi.fn(),
  ensureAvailable: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  isDirectory: vi.fn(),
  archiveDirectory: vi.fn(),
  upload: vi.fn(),
  fileKey: vi.fn(),
  jsonRes: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/support/permission/auth/chat', () => ({ authChatCrud: mocks.auth }));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  findChatSandboxInstance: mocks.findInstance,
  getChatSandboxClient: mocks.getClient,
  getSandboxClient: mocks.createClient
}));
vi.mock('@/service/core/sandbox/fileService', () => ({
  listSandboxDirectory: mocks.list,
  getSandboxFileContent: mocks.read,
  writeSandboxFile: mocks.write,
  isSandboxPathDirectory: mocks.isDirectory,
  addDirectoryToArchive: mocks.archiveDirectory
}));
vi.mock('@fastgpt/service/common/s3/buckets/private', () => ({
  S3PrivateBucket: class {
    uploadFileByBody = mocks.upload;
  }
}));
vi.mock('@fastgpt/service/common/s3/utils', () => ({ getFileS3Key: { temp: mocks.fileKey } }));
vi.mock('@fastgpt/service/common/response', () => ({ jsonRes: mocks.jsonRes }));

import checkExist from '@/pages/api/core/ai/sandbox/checkExist';
import list from '@/pages/api/core/ai/sandbox/list';
import read from '@/pages/api/core/ai/sandbox/read';
import write from '@/pages/api/core/ai/sandbox/write';
import download from '@/pages/api/core/ai/sandbox/download';
import getHtmlPreviewLink from '@/pages/api/core/ai/sandbox/getHtmlPreviewLink';

type Handler = (req: ApiRequestProps, res: NextApiResponse) => unknown;
const routes: { name: string; handler: Handler }[] = [
  { name: 'checkExist', handler: checkExist },
  { name: 'list', handler: list },
  { name: 'read', handler: read },
  { name: 'write', handler: write },
  { name: 'download', handler: download },
  { name: 'getHtmlPreviewLink', handler: getHtmlPreviewLink }
];

describe('Chat sandbox file API context routing', () => {
  const appId = '68ad85a7463006c963799a10';
  const chatId = 'original-preview-chat';
  const sandboxId = 'existing-node-workspace';
  const uid = 'authenticated-user';
  const outLinkAuthData = {
    shareId: 'share-link',
    outLinkUid: 'external-user',
    teamId: '68ad85a7463006c963799a11',
    teamToken: 'team-access'
  };
  const client = {
    id: sandboxId,
    ensureAvailable: mocks.ensureAvailable,
    withActivity: async (run: () => Promise<unknown>) => run()
  };
  const files = [{ name: 'index.html', path: 'index.html', type: 'file', size: 12 }];
  const makeRequest = (selectedSandboxId?: string) =>
    ({
      body: {
        appId,
        chatId,
        sandboxId: selectedSandboxId,
        outLinkAuthData,
        path: 'index.html',
        filePath: 'index.html',
        content: 'updated html',
        userId: 'untrusted-client-user'
      }
    }) as ApiRequestProps;
  const makeResponse = () => ({ setHeader: vi.fn(), send: vi.fn() });
  let previousFeConfigs: typeof global.feConfigs;

  beforeEach(() => {
    vi.resetAllMocks();
    previousFeConfigs = global.feConfigs;
    global.feConfigs = { ...global.feConfigs, show_agent_sandbox: true };
    mocks.auth.mockResolvedValue({ uid, teamId: outLinkAuthData.teamId });
    mocks.findInstance.mockResolvedValue({ sandboxId });
    mocks.getClient.mockResolvedValue(client);
    mocks.ensureAvailable.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue(files);
    mocks.read.mockResolvedValue({
      content: Buffer.from('<head></head>file content'),
      contentType: 'text/html',
      fileName: 'index.html'
    });
    mocks.write.mockResolvedValue(undefined);
    mocks.isDirectory.mockResolvedValue(false);
    mocks.upload.mockResolvedValue({ accessUrl: { url: 'https://preview.example.test/file' } });
    mocks.fileKey.mockReturnValue({ fileKey: 'temporary/preview.html' });
  });

  afterEach(() => {
    global.feConfigs = previousFeConfigs;
  });

  for (const { name, handler } of routes) {
    it.each([undefined, sandboxId])(
      `${name} authenticates the original conversation before resolving workspace %s`,
      async (selectedSandboxId) => {
        const req = makeRequest(selectedSandboxId);
        const res = makeResponse();
        await handler(req, res as unknown as NextApiResponse);
        expect(mocks.auth).toHaveBeenCalledExactlyOnceWith({
          req,
          authToken: true,
          authApiKey: true,
          appId,
          chatId,
          ...outLinkAuthData
        });
        const lookup = name === 'checkExist' ? mocks.findInstance : mocks.getClient;
        expect(lookup).toHaveBeenCalledExactlyOnceWith({
          appId,
          userId: uid,
          chatId,
          sandboxId: selectedSandboxId
        });
        expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
          lookup.mock.invocationCallOrder[0]
        );
        expect(mocks.createClient).not.toHaveBeenCalled();
      }
    );

    it(`${name} never accesses a sandbox when chat authorization fails`, async () => {
      mocks.auth.mockRejectedValue(new Error('chat access denied'));
      await expect(
        handler(makeRequest(sandboxId), makeResponse() as unknown as NextApiResponse)
      ).rejects.toThrow('chat access denied');
      expect(mocks.findInstance).not.toHaveBeenCalled();
      expect(mocks.getClient).not.toHaveBeenCalled();
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.ensureAvailable).not.toHaveBeenCalled();
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.list).not.toHaveBeenCalled();
      expect(mocks.upload).not.toHaveBeenCalled();
    });
  }

  it('returns the chosen sandbox id with the directory to pin subsequent operations', async () => {
    const result = await (list as Handler)(
      makeRequest(),
      makeResponse() as unknown as NextApiResponse
    );
    expect(result).toEqual({ files, sandboxId });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(client, 'index.html');
  });

  it('reports false when the authenticated conversation has no existing workspace', async () => {
    mocks.findInstance.mockResolvedValue(undefined);
    expect(
      await (checkExist as Handler)(makeRequest(), makeResponse() as unknown as NextApiResponse)
    ).toEqual({ exists: false });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('does not look up a workspace when the sandbox feature is disabled', async () => {
    global.feConfigs.show_agent_sandbox = false;
    expect(
      await (checkExist as Handler)(makeRequest(), makeResponse() as unknown as NextApiResponse)
    ).toEqual({ exists: false });
    expect(mocks.findInstance).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
