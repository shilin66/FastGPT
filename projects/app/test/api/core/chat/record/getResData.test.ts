import { expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import getResData from '@/pages/api/core/chat/record/getResData';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { GetResDataQueryType } from '@fastgpt/global/openapi/core/chat/record/api';

it.each(['embedded', 'separate'] as const)(
  'removes duplicate execution IDs from %s history while preserving distinct runs and legacy rows',
  async (storage) => {
    const user = await getUser('agent-response-records');
    const appId = new Types.ObjectId().toHexString();
    await MongoApp.create({
      _id: appId,
      name: 'App',
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: 'simple',
      modules: []
    });
    const identity = { appId, teamId: user.teamId, tmbId: user.tmbId, chatId: 'chat-1' };
    await MongoChat.create({ ...identity, source: 'test', title: 'test' });
    const agent = {
      id: 'agent-run-1',
      nodeId: 'agent-node',
      moduleType: FlowNodeTypeEnum.agent,
      moduleName: 'Agent',
      llmRequestIds: ['llm-request']
    };
    const secondRun = { ...agent, id: 'agent-run-2' };
    const tool = {
      id: 'tool-1',
      nodeId: 'tool-node',
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: 'Tool'
    };
    const legacy = {
      nodeId: 'legacy-node',
      moduleType: FlowNodeTypeEnum.agent,
      moduleName: 'Legacy'
    };
    const responses = [agent, agent, secondRun, tool, legacy, legacy];
    await MongoChatItem.create({
      ...identity,
      obj: ChatRoleEnum.AI,
      dataId: 'answer-1',
      value: [{ text: { content: 'done' } }],
      ...(storage === 'embedded' && { responseData: responses })
    });
    if (storage === 'separate') {
      await MongoChatItemResponse.create(
        responses.map((data) => ({ ...identity, chatItemDataId: 'answer-1', data }))
      );
    }

    const result = await Call<{}, GetResDataQueryType, ChatHistoryItemResType[]>(getResData, {
      auth: user,
      query: { appId, chatId: 'chat-1', dataId: 'answer-1' }
    });

    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(5);
    expect(result.data.filter((item) => item.id === 'agent-run-1')).toHaveLength(1);
    expect(result.data.filter((item) => item.nodeId === 'agent-node')).toHaveLength(2);
    expect(result.data.filter((item) => !item.id)).toHaveLength(2);
    expect(result.data.find((item) => item.id === 'agent-run-1')?.llmRequestIds).toEqual([
      'llm-request'
    ]);
  }
);
