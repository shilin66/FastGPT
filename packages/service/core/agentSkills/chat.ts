import { UserError } from '@fastgpt/global/common/error/utils';
import type { ChatSourceScope } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '../chat/chatSchema';
import { MongoApp } from '../app/schema';
import { MongoChatItem } from '../chat/chatItemSchema';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { AgentContextCheckpointSchema } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getPendingAgentInteraction, readAgentMemory } from '../workflow/dispatch/ai/agent/memory';

export const claimSkillDebugResume = async ({
  skillId,
  teamId,
  chatId,
  nodeId,
  requestId,
  histories
}: {
  skillId: string;
  teamId: string;
  chatId: string;
  nodeId: string;
  requestId: string;
  histories: ChatItemMiniType[];
}) => {
  if (!getPendingAgentInteraction({ histories, nodeId })) return;
  const last = histories.at(-1);
  const memory =
    readAgentMemory({ histories, nodeId, engine: 'pi' }) ??
    readAgentMemory({ histories, nodeId, engine: 'default' });
  if (last?.obj !== ChatRoleEnum.AI || !last.dataId || !memory)
    throw new UserError('skill:skill_resume_unavailable');
  // The in-flight owner keeps its local state; durable history cannot replay it after a crash.
  const result = await MongoChatItem.updateOne(
    {
      appId: skillId,
      chatId,
      ...getSkillChatScope({ skillId, teamId }),
      dataId: last.dataId,
      deleteTime: null,
      execution: { $exists: false },
      memories: last.memories
    },
    {
      $set: {
        [`memories.agentLoopMemory-${nodeId}`]: {
          schemaVersion: 1,
          engine: memory.engine,
          status: 'failed',
          consumedBy: requestId
        }
      },
      $unset: {
        [`memories.piMessages-${nodeId}`]: '',
        [`memories.masterMessages-${nodeId}`]: '',
        [`memories.planMessages-${nodeId}`]: '',
        [`memories.planBuffer-${nodeId}`]: ''
      }
    }
  );
  if (result.matchedCount !== 1) throw new UserError('skill:skill_resume_unavailable');
};

export const loadSkillDebugHistories = async ({
  skillId,
  teamId,
  chatId,
  nodeId
}: {
  skillId: string;
  teamId: string;
  chatId: string;
  nodeId: string;
}): Promise<ChatItemMiniType[]> => {
  const filter = {
    appId: skillId,
    chatId,
    ...getSkillChatScope({ skillId, teamId }),
    deleteTime: null,
    execution: { $exists: false }
  };
  const candidates = await MongoChatItem.find({
    ...filter,
    value: {
      $elemMatch: { 'contextCheckpoint.nodeId': nodeId, 'contextCheckpoint.schemaVersion': 1 }
    }
  })
    .select('_id value')
    .sort({ _id: -1 })
    .limit(20)
    .lean();
  const latest = candidates.find((item) =>
    item.value.some((value) => {
      const parsed = AgentContextCheckpointSchema.safeParse(
        'contextCheckpoint' in value ? value.contextCheckpoint : undefined
      );
      return parsed.success && parsed.data.nodeId === nodeId;
    })
  );
  const histories = await MongoChatItem.find({
    ...filter,
    ...(latest && { _id: { $gte: latest._id } })
  })
    .select('obj value memories dataId')
    .sort({ _id: 1 })
    .limit(201)
    .lean();
  if (histories.length > 200)
    throw new UserError(
      'context_budget_exceeded: start a new conversation; workspace files are retained'
    );
  return histories;
};

export const getSkillChatScope = ({
  skillId,
  teamId
}: {
  skillId: string;
  teamId: string;
}): ChatSourceScope => ({
  teamId,
  sourceType: 'skillEdit',
  sourceId: skillId
});

export const assertSkillChatSession = async ({
  skillId,
  teamId,
  chatId,
  requireExisting = false
}: {
  skillId: string;
  teamId: string;
  chatId: string;
  requireExisting?: boolean;
}) => {
  const [chat, app] = await Promise.all([
    MongoChat.findOne({ appId: skillId, chatId })
      .select('teamId sourceType sourceId +deleteTime')
      .lean(),
    MongoApp.exists({ _id: skillId })
  ]);
  if (
    app ||
    (requireExisting && !chat) ||
    (chat &&
      (String(chat.teamId) !== teamId ||
        chat.sourceType !== 'skillEdit' ||
        String(chat.sourceId) !== skillId ||
        chat.deleteTime))
  ) {
    throw new UserError('Skill debug session is unavailable or has an ambiguous legacy source');
  }
};
