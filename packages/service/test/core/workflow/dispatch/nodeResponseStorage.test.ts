import { expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { WorkflowQueue, type RunWorkflowProps } from '@fastgpt/service/core/workflow/dispatch';
import { createNode } from '../utils';

const mocks = vi.hoisted(() => ({ agent: vi.fn() }));
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/constants', async () => ({
  callbackMap: {
    [(await import('@fastgpt/global/core/workflow/node/constant')).FlowNodeTypeEnum.agent]:
      mocks.agent
  }
}));

const tool: ChatHistoryItemResType = {
  id: 'tool-call-1',
  nodeId: 'tool-call-1',
  moduleType: FlowNodeTypeEnum.tool,
  moduleName: 'Tool'
};

it.each([
  { name: 'without child response list', children: undefined },
  { name: 'with an empty child response list', children: [] },
  { name: 'with tool responses', children: [tool] }
])('stores the Agent once $name and matches streamed responses', async ({ children }) => {
  const originalChildren = children?.slice();
  const node = createNode('agent-node', FlowNodeTypeEnum.agent);
  const onStream = vi.fn();
  mocks.agent.mockResolvedValue({
    responseData: { llmRequestIds: ['llm-request'], model: 'test-model' },
    ...(children && { nodeResponses: children })
  });
  const data: RunWorkflowProps = {
    runtimeNodes: [node],
    runtimeEdges: [],
    checkIsStopping: () => false,
    histories: [],
    query: [],
    variables: {},
    chatConfig: {},
    externalProvider: {},
    runningAppInfo: { id: 'app-1', teamId: 'team-1', tmbId: 'member-1', name: 'App' },
    runningUserInfo: {
      teamId: 'team-1',
      tmbId: 'member-1',
      username: 'user',
      teamName: 'team',
      memberName: 'member',
      contact: ''
    },
    mode: 'chat',
    chatId: 'chat-1',
    uid: 'user-1',
    timezone: 'UTC',
    stream: true,
    apiVersion: 'v2',
    responseAllData: true,
    workflowDispatchDeep: 1,
    maxRunTimes: 10,
    workflowStreamResponse: onStream
  };

  const completed = await new Promise<WorkflowQueue>((resolve) => {
    const queue = new WorkflowQueue({ data, resolve });
    queue.addActiveNode(node.nodeId);
  });

  const streamed = onStream.mock.calls
    .map(([event]) => event)
    .filter((event) => event.event === SseResponseEventEnum.flowNodeResponse)
    .map((event) => event.data);
  expect(completed.chatResponses.filter((item) => item.nodeId === 'agent-node')).toHaveLength(1);
  expect(completed.chatResponses).toHaveLength(1 + (originalChildren?.length ?? 0));
  expect(new Set(completed.chatResponses.map((item) => item.id))).toEqual(
    new Set(streamed.map((item) => item.id))
  );
  expect(children).toEqual(originalChildren);
});
