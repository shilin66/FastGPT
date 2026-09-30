import { describe, expect, it } from 'vitest';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SandboxToolIds } from '@fastgpt/global/core/workflow/node/agent/skillTools';
import {
  SANDBOX_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';

const history = (extra: Partial<ChatItemMiniType> = {}): ChatItemMiniType => ({
  obj: ChatRoleEnum.AI,
  value: [],
  ...extra
});

describe('Sandbox file entry history', () => {
  it.each([SANDBOX_TOOL_NAME, SANDBOX_GET_FILE_URL_TOOL_NAME, ...Object.values(SandboxToolIds)])(
    'recognizes completed %s calls even when response details are omitted',
    (functionName) => {
      const result = addStatisticalDataToHistoryItem(
        history({
          totalQuoteList: [],
          value: [
            {
              tools: [
                {
                  id: 'call',
                  functionName,
                  toolName: 'tool',
                  toolAvatar: '',
                  params: '{}',
                  response: 'done'
                }
              ]
            }
          ]
        })
      );
      expect(result.useAgentSandbox).toBe(true);
    }
  );

  it('keeps the actual workspace identity from a ready event with precomputed citations', () => {
    const result = addStatisticalDataToHistoryItem(
      history({
        totalQuoteList: [],
        value: [
          { sandboxEvent: { id: 'call', status: 'ready', sandboxId: 'actual-debug-workspace' } }
        ]
      })
    );
    expect(result).toMatchObject({ useAgentSandbox: true, sandboxId: 'actual-debug-workspace' });
  });

  it('recognizes nested response data from legacy histories', () => {
    const result = addStatisticalDataToHistoryItem(
      history({
        responseData: [
          {
            id: 'agent',
            nodeId: 'agent',
            moduleName: 'Agent',
            moduleType: FlowNodeTypeEnum.agent,
            childrenResponses: [
              {
                id: 'download',
                nodeId: 'download',
                moduleName: 'Download',
                moduleType: FlowNodeTypeEnum.tool,
                toolId: SANDBOX_GET_FILE_URL_TOOL_NAME
              }
            ]
          }
        ]
      })
    );
    expect(result.useAgentSandbox).toBe(true);
  });

  it('does not show a file entry for plain answers or an unavailable sandbox', () => {
    const plainHistory = history({ value: [{ text: { content: 'Plain answer' } }] });
    expect(addStatisticalDataToHistoryItem(plainHistory)).toBe(plainHistory);
    expect(
      addStatisticalDataToHistoryItem(
        history({
          value: [{ sandboxEvent: { id: 'call', status: 'degraded', code: 'sandbox_unavailable' } }]
        })
      ).useAgentSandbox
    ).toBeFalsy();
  });
});
