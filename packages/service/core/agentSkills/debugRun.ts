import { createHash } from 'node:crypto';
import { MongoChatItem } from '../chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { withSandboxLease } from '../ai/sandbox/lease';
import { getSkillChatScope } from './chat';
import { MongoSandboxInstance } from '../ai/sandbox/schema';
import { SandboxOperationConflict } from '../ai/sandbox/lease';
import { SkillDebugStatusResponseSchema } from '@fastgpt/global/openapi/core/agentSkills/api';

export const getSkillDebugRunStatus = async ({
  skillId,
  teamId,
  chatId
}: {
  skillId: string;
  teamId: string;
  chatId: string;
}) => {
  const scope = { appId: skillId, ...getSkillChatScope({ skillId, teamId }) };
  const expired = {
    ...scope,
    'execution.status': 'running',
    'execution.updatedAt': { $lt: new Date(Date.now() - 60000) }
  };
  if (await MongoChatItem.exists(expired)) {
    try {
      await withSandboxLease(`skill-edit-activity:${skillId}`, async () => {
        await MongoChatItem.updateMany(expired, {
          $set: { 'execution.status': 'interrupted', 'execution.updatedAt': new Date() }
        });
      });
    } catch (error) {
      if (!(error instanceof SandboxOperationConflict)) throw error;
    }
  }
  const [latest, running] = await Promise.all([
    MongoChatItem.findOne({ ...scope, chatId, execution: { $exists: true } })
      .sort({ 'execution.updatedAt': -1 })
      .select('execution')
      .lean(),
    MongoChatItem.exists({ ...scope, 'execution.status': 'running' })
  ]);
  return SkillDebugStatusResponseSchema.parse({
    status: latest && 'execution' in latest ? latest.execution?.status ?? 'idle' : 'idle',
    workspaceRunning: !!running
  });
};

export const withSkillDebugRun = async ({
  skillId,
  teamId,
  tmbId,
  chatId,
  requestId,
  stopped,
  run
}: {
  skillId: string;
  teamId: string;
  tmbId: string;
  chatId: string;
  requestId: string;
  stopped: () => boolean;
  run: (shouldStop: () => boolean) => Promise<'completed' | 'waitingForInput' | 'failed'>;
}) =>
  withSandboxLease(`skill-edit-activity:${skillId}`, async (lease) => {
    const _id = createHash('sha256')
      .update(JSON.stringify(['skill-run', teamId, skillId, chatId, requestId]))
      .digest('hex')
      .slice(0, 24);
    const scope = getSkillChatScope({ teamId, skillId });
    await lease.assertOwned();
    await MongoChatItem.updateMany(
      { ...scope, appId: skillId, 'execution.status': 'running' },
      {
        $set: { 'execution.status': 'interrupted', 'execution.updatedAt': new Date() }
      }
    );
    const previous = await MongoChatItem.findById(_id).lean();
    if (previous) {
      throw new UserError(
        'skill_run_already_submitted: refresh history; interrupted commands are never replayed'
      );
    }
    await MongoChatItem.create({
      _id,
      ...scope,
      appId: skillId,
      chatId,
      tmbId,
      dataId: `run-${requestId}`,
      obj: ChatRoleEnum.AI,
      hideInUI: true,
      value: [],
      execution: { requestId, status: 'running', updatedAt: new Date() }
    });
    lease.setHeartbeat(async () => {
      await MongoSandboxInstance.updateMany(
        { teamId, sourceType: 'skillEdit', sourceId: skillId, status: 'running' },
        {
          $max: { lastActiveAt: new Date() }
        }
      );
      const result = await MongoChatItem.updateOne(
        { _id, 'execution.status': 'running' },
        {
          $set: { 'execution.updatedAt': new Date() }
        }
      );
      return result.matchedCount === 1;
    });
    try {
      const status = await run(() => stopped() || !lease.isActive());
      await lease.assertOwned();
      await MongoChatItem.updateOne(
        { _id, 'execution.status': 'running' },
        {
          $set: {
            'execution.status': stopped() ? 'stopped' : status,
            'execution.updatedAt': new Date()
          }
        }
      );
    } catch (error) {
      await MongoChatItem.updateOne(
        { _id, 'execution.status': 'running' },
        {
          $set: {
            'execution.status': !lease.isActive()
              ? 'interrupted'
              : stopped()
                ? 'stopped'
                : 'failed',
            'execution.updatedAt': new Date()
          }
        }
      );
      throw error;
    }
  });
