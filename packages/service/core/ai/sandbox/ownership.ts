import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { SandboxInstanceSchemaType, SandboxSourceType } from './type';

export const getLegacySourceChatId = (appId: string, sessionId: string): string => {
  try {
    const parts: unknown = JSON.parse(sessionId);
    if (
      Array.isArray(parts) &&
      parts.length === 4 &&
      parts.every((part) => typeof part === 'string') &&
      (parts[0] === 'test' || parts[0] === 'debug') &&
      parts[1] === appId
    )
      return parts[3];
  } catch {
    // Ordinary chat IDs are not JSON.
  }
  return sessionId;
};

export type SandboxOwnership = {
  sourceType: SandboxSourceType;
  sourceId: string;
  teamId?: string;
  runtimeUserId?: string;
  chatId?: string;
  shared: boolean;
};

export const getSandboxOwnership = (doc: SandboxInstanceSchemaType): SandboxOwnership => {
  const conflict = () => {
    throw new Error('sandbox_identity_conflict');
  };
  if (doc.sourceType !== undefined && !['appRuntime', 'skillEdit'].includes(doc.sourceType))
    conflict();
  if (doc.reuseScope !== undefined && !['user', 'session'].includes(doc.reuseScope)) conflict();
  const teamId = doc.teamId ? String(doc.teamId) : doc.metadata?.teamId;
  if (doc.teamId && doc.metadata?.teamId && String(doc.teamId) !== doc.metadata.teamId) conflict();
  const skill =
    doc.sourceType === 'skillEdit' ||
    (!doc.sourceType && doc.metadata?.sandboxType === SandboxTypeEnum.editDebug);
  const sourceType = skill ? 'skillEdit' : 'appRuntime';
  const sourceId = doc.sourceId ?? doc.appId;
  if (
    !sourceId ||
    !/^[a-f\d]{24}$/i.test(sourceId) ||
    (doc.appId != null && doc.appId !== sourceId)
  )
    conflict();
  if (doc.sourceType && !doc.sourceId) conflict();
  if (!doc.sourceType && doc.sourceId !== undefined) conflict();
  if (skill) {
    if (
      !teamId ||
      (doc.sessionId !== undefined && doc.sessionId !== 'edit-debug') ||
      (doc.chatId != null && doc.chatId !== 'edit-debug') ||
      (doc.runtimeUserId !== undefined && doc.runtimeUserId !== 'skillEdit') ||
      doc.reuseScope === 'user' ||
      (doc.metadata?.skillId && doc.metadata.skillId !== sourceId) ||
      (doc.metadata?.sandboxType && doc.metadata.sandboxType !== SandboxTypeEnum.editDebug) ||
      (!doc.sourceType && (doc.appId !== doc.metadata?.skillId || doc.chatId !== 'edit-debug'))
    )
      conflict();
    return { sourceType, sourceId: sourceId!, teamId, shared: true };
  }
  if (
    doc.metadata?.skillId !== undefined ||
    (doc.metadata?.sandboxType && doc.metadata.sandboxType !== SandboxTypeEnum.sessionRuntime)
  )
    conflict();
  const runtimeUserId = doc.runtimeUserId ?? doc.userId;
  if (!runtimeUserId || (doc.userId != null && doc.userId !== runtimeUserId)) conflict();
  if (doc.reuseScope === 'user') {
    if (
      doc.sourceType !== 'appRuntime' ||
      !doc.runtimeUserId ||
      doc.sessionId !== undefined ||
      doc.chatId != null ||
      doc.sourceChatId !== undefined
    )
      conflict();
    return { sourceType, sourceId: sourceId!, teamId, runtimeUserId: runtimeUserId!, shared: true };
  }
  const sessionId = doc.sourceType ? doc.sessionId : doc.chatId;
  if (
    !sessionId ||
    sessionId === 'edit-debug' ||
    (doc.sourceType && (!doc.runtimeUserId || (doc.chatId != null && doc.chatId !== sessionId))) ||
    (!doc.sourceType && (doc.runtimeUserId !== undefined || doc.sessionId !== undefined))
  )
    conflict();
  const chatId = getLegacySourceChatId(sourceId!, sessionId!);
  if (doc.sourceChatId !== undefined && doc.sourceChatId !== chatId) conflict();
  return {
    sourceType,
    sourceId: sourceId!,
    teamId,
    runtimeUserId: runtimeUserId!,
    chatId,
    shared: false
  };
};
