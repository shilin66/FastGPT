import { createHash } from 'node:crypto';
import { SandboxIdentitySchema, type SandboxIdentity } from '@fastgpt/global/core/ai/sandbox/type';
import { MongoSandboxInstance } from './schema';
import { SandboxProviderSchema } from './type';
import { env } from '../../../env';

export const generateSandboxIdentityId = (input: SandboxIdentity): string => {
  const identity = SandboxIdentitySchema.parse(input);
  const tuple =
    identity.sourceType === 'appRuntime'
      ? [2, identity.sourceType, identity.sourceId, identity.runtimeUserId, identity.sessionId]
      : [2, identity.sourceType, identity.sourceId];
  return `sbx-v2-${createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, 48)}`;
};

export const resolveAppSandboxIdentity = async ({
  appId,
  userId,
  chatId
}: {
  appId: string;
  userId: string;
  chatId: string;
}) => {
  const provider = SandboxProviderSchema.parse(env.AGENT_SANDBOX_PROVIDER);
  const identity = {
    sourceType: 'appRuntime' as const,
    sourceId: appId,
    runtimeUserId: userId,
    sessionId: chatId
  };
  const generatedId = generateSandboxIdentityId(identity);
  const candidates = await MongoSandboxInstance.find({
    provider,
    $or: [
      identity,
      { sandboxId: generatedId },
      {
        sourceType: { $exists: false },
        appId,
        userId,
        chatId,
        'metadata.sandboxType': { $exists: false }
      }
    ]
  }).limit(2);
  if (candidates.length > 1) {
    throw new Error('sandbox_identity_migration_required: multiple matching runtime workspaces');
  }
  const existingInstance = candidates.length > 0 ? candidates[0] : undefined;
  if (existingInstance) {
    const legacyMatches =
      !existingInstance.sourceType &&
      !existingInstance.metadata?.sandboxType &&
      existingInstance.appId === appId &&
      existingInstance.userId === userId &&
      existingInstance.chatId === chatId;
    const canonicalMatches =
      existingInstance.sourceType === identity.sourceType &&
      existingInstance.sourceId === appId &&
      existingInstance.runtimeUserId === userId &&
      existingInstance.sessionId === chatId &&
      (existingInstance.appId == null || existingInstance.appId === appId) &&
      (existingInstance.userId == null || existingInstance.userId === userId) &&
      (existingInstance.chatId == null || existingInstance.chatId === chatId);
    if (!legacyMatches && !canonicalMatches) {
      throw new Error('sandbox_identity_migration_required: conflicting runtime ownership');
    }
  }
  if (existingInstance?.deleteTime || existingInstance?.status === 'deleting') {
    throw new Error('sandbox_identity_deleting: runtime workspace deletion is in progress');
  }
  return {
    identity,
    sandboxId: existingInstance?.sandboxId ?? generatedId,
    instance: existingInstance
  };
};
