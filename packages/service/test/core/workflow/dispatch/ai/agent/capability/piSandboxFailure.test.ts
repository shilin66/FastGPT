import { describe, expect, it, vi } from 'vitest';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { buildAgentTools } from '../../../../../../../core/workflow/dispatch/ai/agent/piAgent/toolAdapter';
import { SandboxUnavailableError } from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/errors';
import { createSandboxTestContext } from './sandboxTestContext';

describe('Pi Sandbox tool errors and audit', () => {
  const context = createSandboxTestContext();
  it.each(['sandbox_shell', 'sandbox_get_file_url'])(
    'routes %s through the shared capability before legacy dispatch',
    async (toolId) => {
      const capabilityToolCallHandler = vi.fn(async () => ({
        response: 'shared workspace',
        usages: []
      }));
      const tools = await buildAgentTools({
        completionTools: [{ type: 'function', function: { name: toolId } }],
        ctx: context,
        filesMap: {},
        getSubApp: () => undefined,
        getSubAppInfo: () => ({ name: 'Sandbox', avatar: '', toolDescription: '' }),
        nodeResponses: [],
        capabilityToolCallHandler
      });
      const args = toolId === 'sandbox_shell' ? { command: 'pwd' } : { paths: ['report.txt'] };
      const result = await tools[0].execute('shared-call', args);
      expect(result.content).toEqual([{ type: 'text', text: 'shared workspace' }]);
      expect(capabilityToolCallHandler).toHaveBeenCalledWith(
        toolId,
        JSON.stringify(args),
        'shared-call'
      );
    }
  );

  it('preserves assistant audit values from a capability response', async () => {
    const assistantResponses: AIChatItemValueItemType[] = [];
    const audit: AIChatItemValueItemType = {
      sandboxEvent: { id: 'call', status: 'degraded', code: 'sandbox_unavailable' }
    };
    const tools = await buildAgentTools({
      completionTools: [{ type: 'function', function: { name: 'sandbox_execute' } }],
      ctx: context,
      filesMap: {},
      getSubApp: () => undefined,
      getSubAppInfo: () => ({ name: 'Sandbox', avatar: '', toolDescription: '' }),
      nodeResponses: [],
      assistantResponses,
      capabilityToolCallHandler: async () => ({
        response: 'unavailable',
        usages: [],
        assistantResponses: [audit]
      })
    });
    await tools[0].execute('call', {});
    expect(assistantResponses).toEqual([
      {
        tools: [
          {
            id: 'call',
            functionName: 'sandbox_execute',
            toolName: 'Sandbox',
            toolAvatar: '',
            params: '{}',
            response: 'unavailable'
          }
        ]
      },
      audit
    ]);
  });
  it('signals and rethrows fatal errors before the SDK can continue another model turn', async () => {
    const error = new SandboxUnavailableError();
    const onFatalError = vi.fn();
    const tools = await buildAgentTools({
      completionTools: [{ type: 'function', function: { name: 'sandbox_execute' } }],
      ctx: context,
      filesMap: {},
      getSubApp: () => undefined,
      getSubAppInfo: () => ({ name: 'Sandbox', avatar: '', toolDescription: '' }),
      nodeResponses: [],
      onFatalError,
      capabilityToolCallHandler: async () => {
        throw error;
      }
    });
    await expect(tools[0].execute('call', {})).rejects.toBe(error);
    expect(onFatalError).toHaveBeenCalledWith(error);
  });
});
