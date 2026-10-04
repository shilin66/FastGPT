import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getChatSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  SandboxWriteBodySchema,
  type SandboxWriteResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { writeSandboxFile } from '@/service/core/sandbox/fileService';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<SandboxWriteResponse>
): Promise<SandboxWriteResponse> {
  const {
    appId,
    chatId,
    sandboxId,
    path,
    content,
    expectedHash,
    expectedWorkspaceGeneration,
    outLinkAuthData
  } = SandboxWriteBodySchema.parse(req.body);

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
    if (
      expectedWorkspaceGeneration &&
      expectedWorkspaceGeneration !== (sandbox.workspaceGeneration ?? 'legacy')
    ) {
      jsonRes(res, { code: 409, message: 'sandbox_workspace_changed' });
      return { success: false };
    }
    try {
      const hash = await writeSandboxFile(sandbox, path, content, expectedHash);
      return { success: true, hash };
    } catch (error) {
      if (error instanceof Error && error.message === 'sandbox_file_changed') {
        jsonRes(res, { code: 409, message: 'sandbox_file_changed' });
        return { success: false };
      }
      throw error;
    }
  });
}

export default NextAPI(handler);
