import type { ChatDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';

export const resolveAgentSandboxSessionId = ({
  mode,
  appId,
  nodeId,
  chatId
}: Pick<ChatDispatchProps, 'mode' | 'chatId'> & {
  appId: string;
  nodeId: string;
}): string => {
  if (mode === 'chat') return chatId;

  return JSON.stringify([mode, appId, nodeId, chatId]);
};
