import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { SandboxEditorBodySchema } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { SandboxEditorError } from '@fastgpt/service/core/ai/sandbox/editor';
import { env } from '@fastgpt/service/env';
import { openChatSandboxEditor } from '@/service/core/sandbox/chatEditor';
import {
  SandboxBusyBeforeEffectError,
  SandboxOperationConflict
} from '@fastgpt/service/core/ai/sandbox/lease';
import { ZodError } from 'zod';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const handler = async (req: ApiRequestProps, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') throw new SandboxEditorError('sandbox_editor_method_not_allowed', 405);
  if (!env.AGENT_SANDBOX_CHAT_EDITOR_ENABLED)
    throw new SandboxEditorError('sandbox_editor_disabled', 503);
  const body = SandboxEditorBodySchema.parse(req.body);
  const origin = req.headers.origin;
  if (
    (origin && (!URL.canParse(origin) || new URL(origin).host !== req.headers.host)) ||
    (!origin && req.headers['sec-fetch-site'] !== 'same-origin')
  )
    throw new SandboxEditorError('sandbox_editor_forbidden', 403);
  const principal = await parseHeaderCert({ req, authToken: true }).catch(() => {
    throw new SandboxEditorError('sandbox_editor_login_required', 401);
  });
  if (!principal.userId || !principal.sessionId || !principal.teamId || !principal.tmbId)
    throw new SandboxEditorError('sandbox_editor_login_required', 401);
  const assertAuthorized = async () => {
    if (!env.AGENT_SANDBOX_CHAT_EDITOR_ENABLED)
      throw new SandboxEditorError('sandbox_editor_disabled', 503);
    const current = await parseHeaderCert({ req, authToken: true }).catch(() => {
      throw new SandboxEditorError('sandbox_editor_login_required', 401);
    });
    if (
      current.sessionId !== principal.sessionId ||
      current.userId !== principal.userId ||
      current.teamId !== principal.teamId ||
      current.tmbId !== principal.tmbId
    )
      throw new SandboxEditorError('sandbox_editor_login_required', 401);
    const chat = await authChatCrud({
      req,
      authToken: true,
      appId: body.appId,
      chatId: body.chatId
    }).catch(() => {
      throw new SandboxEditorError('sandbox_editor_forbidden', 403);
    });
    if (
      chat.uid !== principal.tmbId ||
      chat.tmbId !== principal.tmbId ||
      chat.teamId !== principal.teamId
    )
      throw new SandboxEditorError('sandbox_editor_forbidden', 403);
  };
  await assertAuthorized();
  return openChatSandboxEditor({
    ...body,
    userId: principal.tmbId,
    teamId: principal.teamId,
    assertAuthorized
  });
};

export default NextAPI(async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    if (
      error instanceof SandboxEditorError ||
      error instanceof SandboxBusyBeforeEffectError ||
      error instanceof SandboxOperationConflict
    ) {
      const status = error instanceof SandboxEditorError ? error.statusCode : 409;
      const message =
        error instanceof SandboxEditorError
          ? error.code
          : error instanceof SandboxBusyBeforeEffectError
            ? 'sandbox_editor_busy'
            : 'sandbox_editor_recovery_required';
      res.status(status).json({ code: status, message });
      return;
    }
    if (error instanceof ZodError) throw error;
    logger.warn('Chat sandbox editor unavailable', {
      errorType: error instanceof Error ? error.name : 'unknown'
    });
    res.status(503).json({ code: 503, message: 'sandbox_editor_unavailable' });
  }
});
