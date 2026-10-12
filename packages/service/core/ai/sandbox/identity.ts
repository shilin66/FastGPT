import { createHash } from 'node:crypto';
import { SandboxIdentitySchema, type SandboxIdentity } from '@fastgpt/global/core/ai/sandbox/type';
import { MongoSandboxInstance } from './schema';
import { SandboxProviderSchema } from './type';
import { env } from '../../../env';

export type ResolvedAppSandboxIdentity = Awaited<ReturnType<typeof resolveAppSandboxIdentity>>;

export const generateSandboxIdentityId = (input: SandboxIdentity): string => {
  const identity = SandboxIdentitySchema.parse(input);
  if (identity.sourceType === 'appRuntime' && identity.reuseScope === 'user') {
    const tuple = [3, identity.sourceType, identity.sourceId, identity.runtimeUserId];
    return `sbx-v3-${createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, 48)}`;
  }
  if (identity.sourceType === 'appRuntime' && !identity.sessionId)
    throw new Error('Session sandbox identity requires sessionId');
  const tuple =
    identity.sourceType === 'appRuntime'
      ? [2, identity.sourceType, identity.sourceId, identity.runtimeUserId, identity.sessionId]
      : [2, identity.sourceType, identity.sourceId];
  return `sbx-v2-${createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, 48)}`;
};

export const resolveAppSandboxIdentity = async ({
  appId,
  userId,
  chatId: _chatId
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
    reuseScope: 'user' as const
  };
  const generatedId = generateSandboxIdentityId(identity);
  if (await MongoSandboxInstance.exists({ ...identity, provider: { $ne: provider } })) {
    throw new Error(
      'sandbox_provider_migration_required: preserve the existing workspace before changing provider'
    );
  }
  const candidates = await MongoSandboxInstance.find({
    provider,
    $or: [identity, { sandboxId: generatedId }]
  }).limit(2);
  if (candidates.length > 1) {
    throw new Error('sandbox_identity_migration_required: multiple matching runtime workspaces');
  }
  const existingInstance = candidates.length > 0 ? candidates[0] : undefined;
  if (existingInstance) {
    const canonicalMatches =
      existingInstance.reuseScope === 'user' &&
      existingInstance.sourceType === identity.sourceType &&
      existingInstance.sourceId === appId &&
      existingInstance.runtimeUserId === userId &&
      existingInstance.sessionId === undefined &&
      existingInstance.chatId == null &&
      (existingInstance.appId == null || existingInstance.appId === appId) &&
      (existingInstance.userId == null || existingInstance.userId === userId);
    if (!canonicalMatches) {
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
