import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({ principal: vi.fn(), chat: vi.fn(), open: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  parseHeaderCert: mocks.principal
}));
vi.mock('@/service/support/permission/auth/chat', () => ({ authChatCrud: mocks.chat }));
vi.mock('@/service/core/sandbox/chatEditor', () => ({ openChatSandboxEditor: mocks.open }));
vi.mock('@fastgpt/service/env', () => ({ env: { AGENT_SANDBOX_CHAT_EDITOR_ENABLED: true } }));

import editor from '@/pages/api/core/ai/sandbox/editor';

describe('Chat editor authorization', () => {
  const req = {
    method: 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    body: { appId: '6ac138939da0ff8da831ffd1', chatId: 'chat-a', sandboxId: 'workspace-a' }
  } as ApiRequestProps;
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() } as unknown as NextApiResponse;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(res.status).mockReturnValue(res);
    mocks.principal.mockResolvedValue({
      userId: 'account-a',
      teamId: 'team-a',
      tmbId: 'member-a',
      sessionId: 'login'
    });
    mocks.chat.mockResolvedValue({ uid: 'member-a', tmbId: 'member-a', teamId: 'team-a' });
    mocks.open.mockResolvedValue({
      entryUrl: '/api/core/sandbox/proxyAuth?test',
      sandboxId: 'workspace-a'
    });
  });

  it('opens the actual chat user workspace after login and chat authorization', async () => {
    const result = await editor(req, res);
    expect(result).toMatchObject({ sandboxId: 'workspace-a' });
    expect(mocks.open).toHaveBeenCalledWith({
      ...req.body,
      userId: 'member-a',
      teamId: 'team-a',
      assertAuthorized: expect.any(Function)
    });
    expect(mocks.chat.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.open.mock.invocationCallOrder[0]
    );
  });

  it('rejects an administrator viewing another runtime user without starting its editor', async () => {
    mocks.chat.mockResolvedValue({ uid: 'member-b', tmbId: 'member-a' });
    await editor(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('requires a live browser login session', async () => {
    mocks.principal.mockResolvedValue({ userId: 'account-a', tmbId: 'member-a' });
    await editor(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('rejects sharing credentials instead of granting a shell', async () => {
    await expect(
      editor(
        {
          ...req,
          body: { ...req.body, outLinkAuthData: { shareId: 'share', outLinkUid: 'external' } }
        } as ApiRequestProps,
        res
      )
    ).rejects.toThrow();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('does not access resources when chat authorization fails', async () => {
    mocks.chat.mockRejectedValue(new Error('denied'));
    await editor(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('rejects cross-origin requests before touching the workspace', async () => {
    await editor(
      {
        ...req,
        headers: { host: 'localhost:3000', origin: 'https://attacker.test' }
      } as ApiRequestProps,
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.principal).not.toHaveBeenCalled();
  });
  it('rejects commands and arbitrary upstream addresses', async () => {
    await expect(
      editor(
        {
          ...req,
          body: { ...req.body, command: 'whoami', upstream: 'http://other' }
        } as ApiRequestProps,
        res
      )
    ).rejects.toThrow();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('maps a rejected browser credential to a login error without accessing a workspace', async () => {
    mocks.principal.mockRejectedValue(new Error('invalid token'));
    await editor(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('does not expose provider errors or private URLs', async () => {
    mocks.open.mockRejectedValue(new Error('provider failed http://private:8090 secret-token'));
    await editor(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ code: 503, message: 'sandbox_editor_unavailable' });
  });
});
