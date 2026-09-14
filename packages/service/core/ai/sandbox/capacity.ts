import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { env } from '../../../env';
import { MongoSandboxInstance } from './schema';
import { createHash } from 'node:crypto';
import type { ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoTimerLock } from '../../../common/system/timerLock/schema';
import type { SandboxInstanceSchemaType } from './type';

export const hasSandboxCapacityReservation = (
  instance: Pick<SandboxInstanceSchemaType, 'status' | 'capacityReserved'>
) =>
  instance.capacityReserved === true ||
  instance.status === SandboxStatusEnum.running ||
  (instance.capacityReserved !== false &&
    instance.status !== SandboxStatusEnum.stopped &&
    instance.status !== SandboxStatusEnum.archived);

export const withSandboxCapacityTransaction = <T>(
  type: SandboxTypeEnum,
  claim: (session: ClientSession) => Promise<T>
) =>
  mongoSessionRun(async (session) => {
    const timerId = `sandbox-capacity:${type}`;
    // This write serializes admission, not remote work. Its TTL never releases an instance's slot.
    await MongoTimerLock.updateOne(
      { _id: createHash('sha256').update(timerId).digest('hex').slice(0, 24) },
      { $set: { timerId, expiredTime: new Date(Date.now() + 60_000) }, $inc: { __v: 1 } },
      { upsert: true, session }
    );
    return claim(session);
  });

export const getSandboxCapacityType = (instance: {
  sourceType?: unknown;
  metadata?: { sandboxType?: unknown } | null;
}): SandboxTypeEnum | undefined => {
  if (instance.sourceType === 'skillEdit') return SandboxTypeEnum.editDebug;
  const type = instance.metadata?.sandboxType;
  return type === SandboxTypeEnum.editDebug || type === SandboxTypeEnum.sessionRuntime
    ? type
    : undefined;
};

export const assertSandboxCapacity = async (
  type: SandboxTypeEnum,
  onLimit?: (message: string) => void,
  session?: ClientSession
) => {
  const limit =
    type === SandboxTypeEnum.editDebug
      ? global.feConfigs?.limit?.agentSandboxMaxEditDebug ?? env.AGENT_SANDBOX_MAX_EDIT_DEBUG
      : global.feConfigs?.limit?.agentSandboxMaxSessionRuntime ??
        env.AGENT_SANDBOX_MAX_SESSION_RUNTIME;
  if (limit === undefined) return;
  const activeCount = await MongoSandboxInstance.countDocuments(
    {
      $and: [
        type === SandboxTypeEnum.editDebug
          ? { $or: [{ sourceType: 'skillEdit' }, { 'metadata.sandboxType': type }] }
          : { sourceType: { $ne: 'skillEdit' }, 'metadata.sandboxType': type },
        {
          $or: [
            { capacityReserved: true },
            { status: SandboxStatusEnum.running },
            {
              capacityReserved: { $ne: false },
              status: { $nin: [SandboxStatusEnum.stopped, SandboxStatusEnum.archived] }
            }
          ]
        }
      ]
    },
    { session }
  );
  if (activeCount >= limit) {
    const message = `Active ${type} sandbox limit reached (${activeCount}/${limit}). Please try again later.`;
    onLimit?.(message);
    throw new Error(message);
  }
};
