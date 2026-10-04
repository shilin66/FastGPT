import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getChatSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { SandboxReadBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getSandboxFileContent } from '@/service/core/sandbox/fileService';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  const { appId, chatId, sandboxId, path, outLinkAuthData } = SandboxReadBodySchema.parse(req.body);

  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  const sandbox = await getChatSandboxClient({ appId, userId: uid, chatId, sandboxId });
  return sandbox.withActivity(async () => {
    await sandbox.connectRunning();
    const { content, contentType, hash } = await getSandboxFileContent(sandbox, path, true);

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Sandbox-Content-Hash', hash);
    if (sandbox.workspaceGeneration)
      res.setHeader('X-Sandbox-Workspace-Generation', sandbox.workspaceGeneration);
    res.send(content);
  }, 'read');
}

export default NextAPI(handler);
