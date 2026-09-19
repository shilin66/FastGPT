import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/core/workflow/debug';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  createUsage: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (callback: unknown) => callback
}));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: mocks.dispatch
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsageRecord: mocks.createUsage
}));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: async () => ({
    app: { _id: 'app-1', teamId: 'team-1', tmbId: 'owner-1', name: 'App' }
  })
}));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: async () => ({ tmbId: 'runner-1' })
}));
vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: async () => ({ tmbId: 'runner-1' })
}));
vi.mock('@fastgpt/service/common/middle/i18n', () => ({ getLocale: () => 'en' }));

const callDebug = (usageId?: string) =>
  handler(
    {
      body: { appId: 'app-1', nodes: [], edges: [], usageId },
      headers: {}
    } as NextApiRequest,
    {} as NextApiResponse
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dispatch.mockResolvedValue({ debugResponse: {}, newVariables: {} });
  mocks.createUsage.mockResolvedValue('run-1');
});

describe('workflow single-step debug session', () => {
  it('keeps the first request session on later steps using the returned usageId', async () => {
    await callDebug();
    const first = mocks.dispatch.mock.calls[0][0];
    await callDebug(first.usageId);
    const next = mocks.dispatch.mock.calls[1][0];
    expect(first.mode).toBe('debug');
    expect(next.chatId).toBe(first.chatId);
    expect(mocks.createUsage).toHaveBeenCalledTimes(1);
    expect(next.uid).toBe('runner-1');
  });

  it('isolates a fresh run from the previous debug session', async () => {
    await callDebug();
    mocks.createUsage.mockResolvedValueOnce('run-2');
    await callDebug();
    const sessions = mocks.dispatch.mock.calls.map(([input]) => input.chatId);
    expect(sessions[0]).not.toBe(sessions[1]);
    expect(mocks.createUsage).toHaveBeenCalledTimes(2);
  });
});
