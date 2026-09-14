import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchApp,
  dispatchPlugin
} from '../../../../../../../core/workflow/dispatch/ai/agent/sub/app';
import { SandboxUnavailableError } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/errors';
import { createSandboxTestContext } from './sandboxTestContext';

const { runWorkflow } = vi.hoisted(() => ({ runWorkflow: vi.fn() }));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({ runWorkflow }));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: async () => ({
    app: {
      _id: 'child',
      teamId: 'team',
      tmbId: 'owner',
      name: 'Child'
    }
  })
}));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppVersionById: async () => ({ nodes: [], edges: [], chatConfig: {} })
}));
vi.mock('@fastgpt/service/support/user/team/utils', () => ({ getUserChatInfo: async () => ({}) }));

describe.each([
  { name: 'App', dispatch: dispatchApp },
  { name: 'Plugin', dispatch: dispatchPlugin }
])('$name child Sandbox events', ({ dispatch }) => {
  const params: Parameters<typeof dispatch>[0] = {
    ...createSandboxTestContext(),
    appId: 'child',
    variables: { userId: 'visitor', chatId: 'chat' },
    customAppVariables: {},
    userChatInput: 'run'
  };
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it('propagates child infrastructure failures and the original audit to the parent agent', async () => {
    const audit = {
      sandboxEvent: {
        id: 'child-call',
        status: 'failed',
        code: 'sandbox_unavailable',
        skillId: 'skill',
        versionId: 'version',
        sandboxId: 'sandbox',
        operationId: 'operation'
      }
    };
    runWorkflow.mockResolvedValue({
      assistantResponses: [audit],
      flowResponses: [],
      flowUsages: [],
      runTimes: 1
    });
    await expect(dispatch(params)).rejects.toMatchObject({ assistantResponses: [audit] });
    await expect(dispatch(params)).rejects.toBeInstanceOf(SandboxUnavailableError);
  });
  it('retains child degraded audit without treating an unbound App as fatal', async () => {
    const audit = {
      sandboxEvent: { id: 'child-call', status: 'degraded', code: 'sandbox_unavailable' }
    };
    runWorkflow.mockResolvedValue({
      assistantResponses: [{ text: { content: 'answer' } }, audit],
      flowResponses: [],
      flowUsages: [],
      runTimes: 1
    });
    expect((await dispatch(params)).assistantResponses).toEqual([audit]);
  });
  it('fails the parent when the child rejects Skill permission or readiness', async () => {
    runWorkflow.mockResolvedValue({
      assistantResponses: [
        { sandboxEvent: { id: 'child-call', status: 'failed', code: 'skill_unavailable' } }
      ],
      flowResponses: [],
      flowUsages: [],
      runTimes: 1
    });
    await expect(dispatch(params)).rejects.toThrow('skill_unavailable');
  });
});
