import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getChatSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  SandboxListBodySchema,
  type SandboxListResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { listSandboxDirectory } from '@/service/core/sandbox/fileService';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<SandboxListResponse>
): Promise<SandboxListResponse> {
  const { appId, chatId, sandboxId, path, allowStart, outLinkAuthData } =
    SandboxListBodySchema.parse(req.body);

  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  const sandbox = await getChatSandboxClient({ appId, userId: uid, chatId, sandboxId });
  if (allowStart && path === '.') await sandbox.ensureAvailable('interactive');

  return sandbox.withActivity(async () => {
    await sandbox.connectRunning();
    const files = await listSandboxDirectory(sandbox, path);
    return { files, sandboxId: sandbox.id, workspaceGeneration: sandbox.workspaceGeneration };
  }, 'read');
}

export default NextAPI(handler);
