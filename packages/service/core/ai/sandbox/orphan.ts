import { MongoSandboxInstance } from './schema';
import { MongoApp } from '../../app/schema';
import { MongoAgentSkills } from '../../agentSkills/schema';
import { MongoChat } from '../../chat/chatSchema';
import { getSandboxOwnership, type SandboxOwnership } from './ownership';
import { getInstanceBinding } from './operation';
import { getExistingSandboxClient, recoverSandboxOperation } from './controller';
import { SandboxOperationConflict, withSandboxLease, type SandboxLease } from './lease';
import type { SandboxInstanceSchemaType, SandboxProviderType } from './type';
import { getLogger, LogCategories } from '../../../common/logger';
import { env } from '../../../env';
import { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';
import { getSandboxProviderScope } from './config';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
type OrphanReason = NonNullable<SandboxInstanceSchemaType['orphan']>['reason'];

const orphanReason = async (
  doc: SandboxInstanceSchemaType,
  owner: SandboxOwnership
): Promise<OrphanReason | undefined> => {
  // Fetch by identity first: a conflicting team is not proof that the source was deleted.
  const source =
    owner.sourceType === 'appRuntime'
      ? await MongoApp.findOne({ _id: owner.sourceId }, 'teamId deleteTime').lean()
      : await MongoAgentSkills.findOne(
          { _id: owner.sourceId },
          'teamId deleteTime isDeleted'
        ).lean();
  if (source && owner.teamId && String(source.teamId) !== owner.teamId)
    throw new Error('sandbox_source_team_conflict');
  if (!source || source.deleteTime || ('isDeleted' in source && source.isDeleted === true))
    return 'source_deleted';
  if (doc.deleteTime || doc.status === 'deleting') return 'deletion_pending';
  if (owner.shared) return;
  const chat = await MongoChat.findOne(
    {
      appId: owner.sourceId,
      chatId: owner.chatId,
      deleteTime: null,
      sourceType: { $ne: 'skillEdit' }
    },
    'teamId tmbId outLinkUid'
  ).lean();
  if (!chat) return 'chat_unreferenced';
  if (
    String(chat.teamId) !== String(source.teamId) ||
    (chat.outLinkUid ?? String(chat.tmbId)) !== owner.runtimeUserId
  )
    throw new Error('sandbox_chat_owner_conflict');
};

export const sweepOrphanSandboxes = async ({
  provider = env.AGENT_SANDBOX_PROVIDER ?? 'opensandbox',
  now = new Date(),
  graceHours = env.AGENT_SANDBOX_ORPHAN_GRACE_HOURS,
  batchSize = env.AGENT_SANDBOX_ORPHAN_BATCH_SIZE
}: {
  provider?: SandboxProviderType;
  now?: Date;
  graceHours?: number;
  batchSize?: number;
} = {}) => {
  if (
    !Number.isFinite(graceHours) ||
    graceHours < 1 ||
    !Number.isInteger(batchSize) ||
    batchSize < 1
  )
    throw new Error('sandbox_orphan_config_invalid');
  const stats = {
    scanned: 0,
    marked: 0,
    cleared: 0,
    deleted: 0,
    archived: 0,
    retained: 0,
    errors: 0
  };
  const inactiveBefore = new Date(now.getTime() - graceHours * 3600_000);
  const highWatermark = await MongoSandboxInstance.findOne({ provider }, '_id')
    .sort({ _id: -1 })
    .lean();
  let cursor: string | undefined;
  while (highWatermark) {
    const page = await MongoSandboxInstance.find({
      provider,
      _id: { $lte: highWatermark._id, ...(cursor ? { $gt: cursor } : {}) }
    })
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();
    if (!page.length) break;
    for (const selected of page) {
      stats.scanned++;
      try {
        const owner = getSandboxOwnership(selected);
        const reason = await orphanReason(selected, owner);
        const binding = {
          ...getInstanceBinding(selected, true),
          lastActiveAt: selected.lastActiveAt
        };
        if (!reason || (reason === 'chat_unreferenced' && selected.status === 'archived')) {
          if (selected.orphan) {
            const cleared = await MongoSandboxInstance.updateOne(
              { ...binding, 'orphan.detectedAt': selected.orphan.detectedAt },
              { $unset: { orphan: 1 } }
            );
            stats.cleared += cleared.modifiedCount;
          }
          continue;
        }
        if (
          !selected.orphan ||
          selected.orphan.reason !== reason ||
          selected.orphan.lastActiveAt.getTime() !== selected.lastActiveAt.getTime()
        ) {
          const marked = await MongoSandboxInstance.updateOne(
            { ...binding, 'orphan.detectedAt': selected.orphan?.detectedAt ?? { $exists: false } },
            { $set: { orphan: { reason, detectedAt: now, lastActiveAt: selected.lastActiveAt } } }
          );
          stats.marked += marked.modifiedCount;
          continue;
        }
        if (selected.orphan.detectedAt > inactiveBefore || selected.lastActiveAt > inactiveBefore)
          continue;
        let sourceLease: SandboxLease | undefined;
        let skillLease: SandboxLease | undefined;
        const assertAuthorized = async () => {
          await sourceLease?.assertOwned();
          await skillLease?.assertOwned();
          const current = await MongoSandboxInstance.findOne({
            _id: selected._id,
            provider,
            sandboxId: selected.sandboxId
          }).lean();
          if (
            !current ||
            current.lastActiveAt.getTime() !== selected.lastActiveAt.getTime() ||
            current.orphan?.reason !== reason ||
            current.orphan.detectedAt.getTime() !== selected.orphan!.detectedAt.getTime() ||
            (await orphanReason(current, getSandboxOwnership(current))) !== reason
          )
            throw new SandboxOperationConflict('Sandbox orphan ownership or activity changed');
        };
        const clean = async () => {
          await assertAuthorized();
          let current = selected;
          // Only established recovery diagnoses may authorize an uncertain delete checkpoint.
          if (
            current.status === 'deleting' &&
            current.operation?.failureDisposition === 'unknown'
          ) {
            if (current.providerScope !== getSandboxProviderScope(provider))
              throw new SandboxOperationConflict(
                'Unknown deletion has no matching provider deployment'
              );
            if (
              (current.operation.heartbeatAt ?? current.operation.updatedAt) >
              new Date(now.getTime() - 45 * 60_000)
            )
              return;
            await recoverSandboxOperation({
              provider,
              sandboxId: current.sandboxId,
              operationId: current.operation.id,
              assertAuthorized
            });
            const recovered = await MongoSandboxInstance.findOne({ _id: current._id }).lean();
            if (!recovered) return;
            current = recovered;
          }
          if (reason !== 'chat_unreferenced') {
            const client = getExistingSandboxClient(current);
            await client.delete({
              assertAuthorized,
              shouldRun: async (doc) => {
                // Absence is conclusive only on the persisted deployment; legacy rows need a live ID match.
                if (
                  provider === 'opensandbox' &&
                  (doc.status === 'running' || doc.capacityReserved === true)
                ) {
                  const providerId = doc.metadata?.providerSandboxId;
                  if (!providerId || !(client.provider instanceof OpenSandboxAdapter))
                    throw new SandboxOperationConflict(
                      'Orphan compute ownership could not be confirmed'
                    );
                  const remote = await client.provider.inspectExisting(providerId);
                  if (
                    remote?.id !== providerId &&
                    !(remote === null && doc.providerScope === getSandboxProviderScope(provider))
                  )
                    throw new SandboxOperationConflict(
                      'Orphan compute ownership could not be confirmed'
                    );
                }
                return true;
              }
            });
            stats.deleted++;
            return;
          }
          if (current.status === 'running') {
            await getExistingSandboxClient(current).stop({ inactiveBefore, assertAuthorized });
            const stopped = await MongoSandboxInstance.findOne({ _id: current._id }).lean();
            if (!stopped) return;
            current = stopped;
          }
          if (provider !== 'opensandbox' || !current.storage?.volumeManager?.ensured) {
            stats.retained++;
            logger.warn('Orphan chat sandbox retained: persistent archive is unavailable', {
              sandboxId: current.sandboxId,
              status: current.status
            });
            return;
          }
          await getExistingSandboxClient(current).archive({ assertAuthorized });
          stats.archived++;
        };
        await withSandboxLease(
          `sandbox-source:${owner.sourceType}:${owner.sourceId}`,
          async (lease) => {
            sourceLease = lease;
            if (owner.sourceType === 'skillEdit') {
              await withSandboxLease(`skill-edit-activity:${owner.sourceId}`, async (lease) => {
                skillLease = lease;
                if (selected.status === 'running') {
                  const { assertSkillWorkspaceTerminalIdle } = await import('./terminal');
                  await assertSkillWorkspaceTerminalIdle(selected);
                }
                await clean();
              });
            } else await clean();
          }
        );
      } catch (error) {
        if (error instanceof SandboxOperationConflict) {
          stats.retained++;
          logger.warn('Sandbox orphan cleanup deferred', {
            sandboxId: selected.sandboxId,
            reason: error.message
          });
        } else {
          stats.errors++;
          logger.error('Sandbox orphan sweep retained resources after failure', {
            sandboxId: selected.sandboxId,
            error
          });
        }
      }
    }
    cursor = String(page[page.length - 1]._id);
    if (page.length < batchSize) break;
  }
  logger.info('Sandbox orphan sweep completed', { provider, ...stats });
  return stats;
};
