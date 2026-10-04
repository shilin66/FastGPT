import { MongoSandboxInstance } from './schema';
import { MongoApp } from '../../app/schema';
import { retryAppDeleteJob } from '../../app/delete';
import { getSandboxArchiveStorage } from './archiveStorage';
import { getLogger, LogCategories } from '../../../common/logger';
import { env } from '../../../env';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export const auditSandboxArchives = async ({
  batchSize = env.AGENT_SANDBOX_ORPHAN_BATCH_SIZE
}: { batchSize?: number } = {}) => {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new Error('sandbox_orphan_config_invalid');
  const keys = await getSandboxArchiveStorage().list();
  const result = { scanned: keys.length, unreferenced: 0 };
  for (let offset = 0; offset < keys.length; offset += batchSize) {
    const page = keys.slice(offset, offset + batchSize);
    // Archive receipts are persisted before upload; unfinished operations also own their keys.
    const instances = await MongoSandboxInstance.find(
      { $or: [{ 'archive.key': { $in: page } }, { archiveKeys: { $in: page } }] },
      'archive archiveKeys'
    ).lean();
    const referenced = new Set(
      instances.flatMap((doc) => [
        ...(doc.archiveKeys ?? []),
        ...(doc.archive ? [doc.archive.key] : [])
      ])
    );
    const unreferenced = page.filter((key) => !referenced.has(key));
    result.unreferenced += unreferenced.length;
    if (unreferenced.length)
      logger.warn('Unreferenced sandbox archives retained for ownership review', {
        count: unreferenced.length,
        keys: unreferenced.slice(0, 20)
      });
  }
  logger.info('Sandbox archive reference audit completed', result);
  return result;
};

export const retryDeletedAppCleanup = async ({
  now = new Date(),
  graceHours = env.AGENT_SANDBOX_ORPHAN_GRACE_HOURS,
  batchSize = env.AGENT_SANDBOX_ORPHAN_BATCH_SIZE
}: { now?: Date; graceHours?: number; batchSize?: number } = {}) => {
  if (
    !Number.isFinite(graceHours) ||
    graceHours < 1 ||
    !Number.isInteger(batchSize) ||
    batchSize < 1
  )
    throw new Error('sandbox_orphan_config_invalid');
  const deletedBefore = new Date(now.getTime() - graceHours * 3600_000);
  const result = { scheduled: 0, retained: 0, errors: 0 };
  const highWatermark = await MongoApp.findOne({ deleteTime: { $lt: deletedBefore } }, '_id')
    .sort({ _id: -1 })
    .lean();
  let cursor: string | undefined;
  while (highWatermark) {
    const apps = await MongoApp.find(
      {
        deleteTime: { $lt: deletedBefore },
        _id: { $lte: highWatermark._id, ...(cursor ? { $gt: cursor } : {}) }
      },
      'teamId deleteTime'
    )
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();
    if (!apps.length) break;
    for (const app of apps) {
      try {
        // Recheck the deletion request, including team ownership, before enqueueing compensation.
        if (
          !(await MongoApp.exists({ _id: app._id, teamId: app.teamId, deleteTime: app.deleteTime }))
        )
          continue;
        // The orphan sweep must clear every known App sandbox first. Retrying the
        // original job early would bypass its grace period and provider identity guards.
        const appId = String(app._id);
        if (
          await MongoSandboxInstance.exists({
            $or: [
              { sourceType: 'appRuntime', sourceId: appId },
              {
                appId,
                sourceType: { $ne: 'skillEdit' },
                'metadata.sandboxType': { $ne: SandboxTypeEnum.editDebug }
              }
            ]
          })
        ) {
          result.retained++;
          continue;
        }
        await retryAppDeleteJob({ appId, teamId: String(app.teamId) });
        result.scheduled++;
      } catch (error) {
        result.errors++;
        logger.error('Failed to retry deleted App cleanup', { appId: String(app._id), error });
      }
    }
    cursor = String(apps[apps.length - 1]._id);
    if (apps.length < batchSize) break;
  }
  logger.info('Deleted App cleanup compensation completed', result);
  return result;
};
