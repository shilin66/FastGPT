import { createHash } from 'node:crypto';
import type { SandboxWorkspaceItem } from '@fastgpt/global/openapi/core/ai/sandbox/management';

type SandboxNameSource = {
  sourceType: 'appRuntime' | 'skillEdit';
  sourceId: string;
  runtimeUserId?: string;
  reuseScope?: 'user' | 'session';
  sourceChatId?: string;
  sessionId?: string;
  sandboxId: string;
};

const shortCode = (kind: string, id: string, length: number) =>
  createHash('sha256')
    .update(JSON.stringify([kind, id]))
    .digest('hex')
    .slice(0, length);

export const getSandboxDisplayFields = (
  source: Pick<SandboxNameSource, 'sourceType' | 'reuseScope' | 'sourceChatId' | 'sessionId'>
): Pick<SandboxWorkspaceItem, 'reuseScope' | 'purpose'> => {
  if (source.sourceType === 'skillEdit') return { reuseScope: 'source', purpose: 'edit' };
  if (source.reuseScope === 'user') return { reuseScope: 'user', purpose: 'runtime' };
  return {
    reuseScope: source.reuseScope === 'session' || source.sessionId ? 'session' : 'unknown',
    purpose:
      source.sourceChatId && source.sessionId
        ? source.sessionId === source.sourceChatId
          ? 'chat'
          : 'debug'
        : 'unknown'
  };
};

export const getSandboxTechnicalName = (source: SandboxNameSource): string => {
  const instance = shortCode('workspace', source.sandboxId, 16);
  if (source.sourceType === 'skillEdit') {
    return `skill-${shortCode('skill', source.sourceId, 8)}-edit-${instance}`;
  }
  if (source.reuseScope === 'user' && source.runtimeUserId)
    return `agent-${shortCode('agent', source.sourceId, 8)}-user-${shortCode('user', source.runtimeUserId, 8)}-${instance}`;
  const purpose =
    source.sourceChatId && source.sessionId === source.sourceChatId ? 'chat' : 'debug';
  const chatId = source.sourceChatId ?? source.sessionId ?? source.sandboxId;
  return `agent-${shortCode('agent', source.sourceId, 8)}-${purpose}-${shortCode('chat', chatId, 8)}-${instance}`;
};

const labelValue = (value: string) =>
  value.length <= 63 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
    ? value
    : shortCode('label', value, 16);

export const getSandboxOwnershipMetadata = (source: SandboxNameSource) => ({
  'fastgpt.io/kind': source.sourceType === 'skillEdit' ? 'skill' : 'agent',
  'fastgpt.io/source': labelValue(source.sourceId),
  'fastgpt.io/workspace': shortCode('workspace', source.sandboxId, 16),
  'omni.io/ref': getSandboxTechnicalName(source),
  ...(source.sourceChatId ? { 'fastgpt.io/chat': labelValue(source.sourceChatId) } : {})
});
