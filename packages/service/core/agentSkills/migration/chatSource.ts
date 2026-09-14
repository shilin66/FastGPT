import { z } from 'zod';
import { Types, type ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoChat } from '../../chat/chatSchema';
import { MongoChatItem } from '../../chat/chatItemSchema';
import { MongoChatItemResponse } from '../../chat/chatItemResponseSchema';
import { MongoAgentSkills } from '../schema';
import { MongoApp } from '../../app/schema';
import { getSkillChatScope } from '../chat';
import { MongoAgentSkillMigrationCheckpoint } from './schema';

export const SkillChatSourceMigrationKey = 'agent-skills-chat-source-v1';
const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const SkillChatSourceMigrationSchema = z.object({
  teamId: ObjectIdSchema,
  skillId: ObjectIdSchema,
  chatIds: z.array(ObjectIdSchema).min(1).max(100),
  mode: z.enum(['dry-run', 'backfill', 'rollback']).default('dry-run'),
  confirmWrite: z.boolean().default(false)
});

type MigrationParams = z.infer<typeof SkillChatSourceMigrationSchema>;
type SourceRow = {
  _id: unknown;
  teamId: unknown;
  sourceType?: string;
  sourceId?: unknown;
};
type MigrationResult = {
  chatId: string;
  status: 'eligible' | 'completed' | 'rolled-back' | 'conflict';
  reason?: string;
};
class ChatSourceMigrationConflict extends Error {}
const conflict = (message: string): never => {
  throw new ChatSourceMigrationConflict(message);
};
const ids = (rows: SourceRow[]) => rows.map((row) => String(row._id)).sort();
const sameIds = (left: string[], right: string[]) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].map(String).sort());
const missingSource = { sourceType: { $exists: false }, sourceId: { $exists: false } };

const readGroup = async (params: MigrationParams & { chatId: string }, session?: ClientSession) => {
  const { teamId, skillId, chatId } = params;
  const skill = await MongoAgentSkills.exists({ _id: skillId, teamId, deleteTime: null }).session(
    session ?? null
  );
  const app = await MongoApp.exists({ _id: skillId }).session(session ?? null);
  const chat = await MongoChat.findById(chatId)
    .select('teamId appId chatId source sourceType sourceId +deleteTime')
    .session(session ?? null)
    .lean();
  if (
    !skill ||
    app ||
    !chat ||
    String(chat.teamId) !== teamId ||
    String(chat.appId) !== skillId ||
    typeof chat.chatId !== 'string' ||
    !chat.chatId ||
    chat.source !== 'test' ||
    chat.deleteTime
  ) {
    return conflict('The selected Chat is not an unambiguous live Skill debug candidate');
  }
  const filter = { appId: skillId, chatId: chat.chatId };
  const chatCount = await MongoChat.countDocuments(filter).session(session ?? null);
  const items = await MongoChatItem.find(filter)
    .select('_id teamId sourceType sourceId')
    .session(session ?? null)
    .lean();
  const responses = await MongoChatItemResponse.find(filter)
    .select('_id teamId sourceType sourceId')
    .session(session ?? null)
    .lean();
  if (chatCount !== 1) return conflict('The selected Chat has a duplicate legacy session key');
  return { chat, items, responses, filter };
};

const migrateOne = async (
  params: MigrationParams & { chatId: string },
  session?: ClientSession
): Promise<MigrationResult> => {
  const { skillId, teamId, chatId, mode } = params;
  const group = await readGroup(params, session);
  const scope = getSkillChatScope({ skillId, teamId });
  const checkpointFilter = { migrationKey: SkillChatSourceMigrationKey, resourceId: chatId };
  const checkpoint = await MongoAgentSkillMigrationCheckpoint.findOne(checkpointFilter)
    .session(session ?? null)
    .lean();
  const rows: SourceRow[] = [group.chat, ...group.items, ...group.responses];
  const checkpointScope = checkpoint?.chatSource;
  const rollback = mode === 'rollback';
  if (rollback || checkpoint?.status === 'completed') {
    if (
      !checkpointScope ||
      checkpoint?.status !== 'completed' ||
      String(checkpointScope.teamId) !== teamId ||
      String(checkpointScope.skillId) !== skillId ||
      checkpointScope.chatId !== group.chat.chatId
    ) {
      return conflict('A matching completed migration checkpoint is required');
    }
    if (
      !rows.every(
        (row) =>
          String(row.teamId) === teamId &&
          row.sourceType === 'skillEdit' &&
          String(row.sourceId) === skillId
      )
    ) {
      return conflict('The migrated group source or ownership changed');
    }
    if (!rollback) return { chatId, status: 'completed' };
    if (
      !sameIds(ids(group.items), checkpointScope.chatItemIds) ||
      !sameIds(ids(group.responses), checkpointScope.responseIds)
    ) {
      return conflict('The migrated group membership changed; rollback would leave mixed sources');
    }
  } else if (
    !rows.every(
      (row) =>
        String(row.teamId) === teamId &&
        !Object.hasOwn(row, 'sourceType') &&
        !Object.hasOwn(row, 'sourceId')
    )
  ) {
    return conflict('The selected group includes foreign ownership or explicit source fields');
  }
  if (mode === 'dry-run') return { chatId, status: 'eligible' };
  if (!session) throw new Error('Chat source writes require a transaction');

  const sourceFilter = rollback ? scope : { teamId, ...missingSource };
  const update = rollback
    ? { $unset: { sourceType: '', sourceId: '' } }
    : { $set: { sourceType: scope.sourceType, sourceId: scope.sourceId } };
  const chatResult = await MongoChat.updateOne(
    { _id: chatId, ...group.filter, ...sourceFilter, source: 'test', deleteTime: null },
    update,
    { session }
  );
  const itemResult = await MongoChatItem.updateMany(
    { _id: { $in: ids(group.items) }, ...group.filter, ...sourceFilter },
    update,
    { session }
  );
  const responseResult = await MongoChatItemResponse.updateMany(
    { _id: { $in: ids(group.responses) }, ...group.filter, ...sourceFilter },
    update,
    { session }
  );
  if (
    chatResult.matchedCount !== 1 ||
    itemResult.matchedCount !== group.items.length ||
    responseResult.matchedCount !== group.responses.length
  ) {
    return conflict('Chat source compare-and-set failed; the whole transaction was aborted');
  }
  const status = rollback ? 'rolled-back' : 'completed';
  await MongoAgentSkillMigrationCheckpoint.updateOne(
    checkpointFilter,
    {
      $set: {
        status,
        updatedAt: new Date(),
        chatSource: {
          teamId,
          skillId,
          chatId: group.chat.chatId,
          chatItemIds: ids(group.items),
          responseIds: ids(group.responses)
        }
      },
      $setOnInsert: { createdAt: new Date() },
      $inc: { attemptCount: 1 }
    },
    { upsert: true, session }
  );
  return { chatId, status };
};

/** Requires stopped legacy writers and a backup before explicit backfill or rollback. */
export const migrateSkillChatSources = async (
  input: z.input<typeof SkillChatSourceMigrationSchema>
) => {
  const params = SkillChatSourceMigrationSchema.parse(input);
  if (params.mode !== 'dry-run' && !params.confirmWrite)
    throw new Error('confirmWrite is required');
  const results: MigrationResult[] = [];
  for (const chatId of [
    ...new Set(params.chatIds.map((id) => new Types.ObjectId(id).toHexString()))
  ]) {
    try {
      results.push(
        params.mode === 'dry-run'
          ? await migrateOne({ ...params, chatId })
          : await mongoSessionRun((session) => migrateOne({ ...params, chatId }, session))
      );
    } catch (error) {
      if (!(error instanceof ChatSourceMigrationConflict)) throw error;
      results.push({ chatId, status: 'conflict', reason: error.message });
    }
  }
  return { migrationKey: SkillChatSourceMigrationKey, mode: params.mode, results };
};
