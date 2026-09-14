import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionError } from '@fastgpt-sdk/sandbox-adapter';
import { dispatchSandboxShell } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox';
import { SandboxUnavailableError } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/errors';
import { buildAgentTools } from '../../../../../../../core/workflow/dispatch/ai/agent/piAgent/toolAdapter';
import { createSandboxTestContext } from './sandboxTestContext';

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), execute: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getSandboxClient: mocks.getClient
}));

describe('Generic Sandbox tool infrastructure contract', () => {
  const params = { appId: 'app', userId: 'user', chatId: 'chat', command: 'false' };
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getClient.mockResolvedValue({ exec: mocks.execute });
  });
  it('preserves a real script exit code without reporting infrastructure failure', async () => {
    mocks.execute.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'script failure' });
    const result = await dispatchSandboxShell({ ...params, requireSandbox: true });
    expect(JSON.parse(result.response)).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'script failure'
    });
    expect(result.assistantResponses).toBeUndefined();
  });
  it('degrades unbound Apps with a safe persistent event', async () => {
    mocks.getClient.mockRejectedValue(new Error('private provider configuration'));
    const result = await dispatchSandboxShell(params);
    expect(result.response).toContain('sandbox_unavailable');
    expect(result.response).not.toContain('private');
    expect(result.assistantResponses).toEqual([
      { sandboxEvent: expect.objectContaining({ status: 'degraded', code: 'sandbox_unavailable' }) }
    ]);
  });
  it('fails a bound App using the generic VM tool without replaying the command', async () => {
    mocks.execute.mockRejectedValue(new ConnectionError('private transport'));
    await expect(dispatchSandboxShell({ ...params, requireSandbox: true })).rejects.toBeInstanceOf(
      SandboxUnavailableError
    );
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('disables generic VM tools after an unbound App degrades', async () => {
    mocks.getClient.mockRejectedValue(new Error('offline'));
    const tools = await buildAgentTools({
      completionTools: [{ type: 'function', function: { name: 'sandbox_shell' } }],
      ctx: createSandboxTestContext(),
      filesMap: {},
      getSubApp: () => undefined,
      getSubAppInfo: () => ({ name: 'Sandbox', avatar: '', toolDescription: '' }),
      nodeResponses: []
    });
    await tools[0].execute('call-1', { command: 'true' });
    await tools[0].execute('call-2', { command: 'true' });
    expect(mocks.getClient).toHaveBeenCalledTimes(1);
  });
});
