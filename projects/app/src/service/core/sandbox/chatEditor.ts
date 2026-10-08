import { randomUUID } from 'node:crypto';
import { getChatSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getInstanceBinding } from '@fastgpt/service/core/ai/sandbox/operation';
import { getSandboxProviderScope } from '@fastgpt/service/core/ai/sandbox/config';
import { ensureSandboxEditor, SandboxEditorError } from '@fastgpt/service/core/ai/sandbox/editor';
import { prepareSandboxSessionDirectory } from '@fastgpt/service/core/ai/sandbox/workspace';
import {
  getRuntimeSandboxWorkspaceRoot,
  disconnectFromProviderSandbox
} from '@fastgpt/service/core/agentSkills/sandboxConfig';
import { getSandboxProxyResourceId } from '@fastgpt/global/core/ai/sandbox/proxy';
import type { SandboxEditorResponse } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getSandboxProxyOrigins, getSandboxProxyBasePath } from './proxyUtils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getSandboxEditorEndpoint } from '@fastgpt/service/core/ai/sandbox/editorEndpoint';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export const openChatSandboxEditor = async (scope: {
  appId: string;
  chatId: string;
  userId: string;
  teamId: string;
  sandboxId?: string;
  assertAuthorized: () => Promise<void>;
}): Promise<SandboxEditorResponse> => {
  const { assertAuthorized, teamId, ...fileScope } = scope;
  const startedAt = Date.now();
  let stage = 'selection';
  const sandbox = await getChatSandboxClient(fileScope).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'Sandbox workspace not found')
      throw new SandboxEditorError('sandbox_editor_not_found', 404);
    throw error;
  });
  if (sandbox.provider.provider !== 'opensandbox')
    throw new SandboxEditorError('sandbox_editor_unsupported', 422);
  try {
    stage = 'authorization';
    await assertAuthorized();
    stage = 'ensure';
    await sandbox.ensureAvailable('interactive', { preserveBoundRuntime: true });
    stage = 'activity';
    return await sandbox.withActivity(async () => {
      stage = 'connect';
      await sandbox.connectRunning();
      const provider = sandbox.provider;
      stage = 'binding';
      const instance = await MongoSandboxInstance.findOne({
        provider: 'opensandbox',
        sandboxId: sandbox.id
      }).lean();
      const providerScope = getSandboxProviderScope('opensandbox');
      if (
        !instance ||
        instance.status !== 'running' ||
        instance.deleteTime ||
        instance.providerScope !== providerScope ||
        (instance.runtimeUserId ?? instance.userId) !== scope.userId ||
        (instance.sourceId ?? instance.appId) !== scope.appId ||
        (instance.teamId && String(instance.teamId) !== teamId) ||
        instance.sourceType === 'skillEdit' ||
        instance.metadata?.skillId
      )
        throw new SandboxEditorError('sandbox_editor_binding_changed', 409);
      const info = await provider.getInfo();
      if (
        !info ||
        info.status.state !== 'Running' ||
        info.id !== instance.metadata?.providerSandboxId
      )
        throw new SandboxEditorError('sandbox_editor_binding_changed', 409);
      const root = getRuntimeSandboxWorkspaceRoot(instance);
      stage = 'editor_start';
      if (instance.reuseScope === 'user')
        await prepareSandboxSessionDirectory(provider, root, sandbox.workspaceRoot);
      await ensureSandboxEditor(provider, root);
      stage = 'endpoint';
      let endpoint = await getSandboxEditorEndpoint(provider);
      const previous = instance.metadata?.editor;
      let generation =
        previous?.providerSandboxId === info.id &&
        previous.providerScope === providerScope &&
        previous.workspaceGeneration === instance.workspaceGeneration
          ? previous.generation
          : randomUUID();
      await assertAuthorized();
      stage = 'checkpoint';
      const result = await MongoSandboxInstance.updateOne(
        {
          ...getInstanceBinding(instance, true),
          'metadata.editor.generation': previous?.generation ?? null,
          status: 'running',
          deleteTime: null
        },
        {
          $set: {
            'metadata.editor': {
              generation,
              providerSandboxId: info.id,
              providerScope,
              ...(instance.workspaceGeneration
                ? { workspaceGeneration: instance.workspaceGeneration }
                : {}),
              status: 'ready',
              endpoint,
              startedAt: new Date()
            },
            sourceType: 'appRuntime',
            sourceId: scope.appId,
            runtimeUserId: scope.userId,
            teamId
          }
        }
      );
      if (result.matchedCount !== 1) {
        // Another first-open request may already have published this physical editor.
        const current = await MongoSandboxInstance.findOne({
          ...getInstanceBinding(instance, true),
          sourceType: 'appRuntime',
          sourceId: scope.appId,
          runtimeUserId: scope.userId,
          teamId,
          status: 'running',
          deleteTime: null,
          'metadata.editor.providerSandboxId': info.id,
          'metadata.editor.providerScope': providerScope,
          'metadata.editor.workspaceGeneration': instance.workspaceGeneration ?? null,
          'metadata.editor.status': 'ready'
        }).lean();
        if (!current?.metadata?.editor?.endpoint)
          throw new SandboxEditorError('sandbox_editor_binding_changed', 409);
        generation = current.metadata.editor.generation;
        endpoint = current.metadata.editor.endpoint;
      }
      const resourceId = getSandboxProxyResourceId({
        sandboxId: sandbox.id,
        editorGeneration: generation
      });
      const originInput = {
        sandboxId: resourceId,
        targetPort: endpoint.port,
        host: new URL(
          process.env.AGENT_SANDBOX_PROXY_APP_ORIGIN ??
            `http://localhost:${process.env.PORT ?? '3000'}`
        ).host
      };
      const { audience } = getSandboxProxyOrigins(originInput);
      const next = new URL(`${getSandboxProxyBasePath(originInput)}/proxy/8080/`, audience);
      next.searchParams.set('folder', sandbox.workspaceRoot);
      logger.info('Chat sandbox editor ready', {
        sandboxId: sandbox.id,
        providerSandboxId: info.id,
        durationMs: Date.now() - startedAt,
        reusedEditor: generation === previous?.generation
      });
      const entry = new URLSearchParams({
        sandboxId: resourceId,
        port: String(endpoint.port),
        next: next.toString(),
        expectedProviderSandboxId: info.id,
        expectedEditorGeneration: generation
      });
      if (instance.workspaceGeneration)
        entry.set('expectedWorkspaceGeneration', instance.workspaceGeneration);
      return {
        sandboxId: sandbox.id,
        editorGeneration: generation,
        workspaceGeneration: instance.workspaceGeneration,
        directory: sandbox.workspaceRoot,
        entryUrl: `/api/core/sandbox/proxyAuth?${entry}`,
        persistence: instance.storage?.volumeManager?.ensured ? 'persistent' : 'container'
      };
    });
  } catch (error) {
    logger.warn('Chat sandbox editor preparation failed', {
      sandboxId: sandbox.id,
      stage,
      errorType: error instanceof Error ? error.name : 'unknown',
      code: error instanceof SandboxEditorError ? error.code : undefined
    });
    throw error;
  } finally {
    const provider = sandbox.provider;
    if (provider.id) {
      await disconnectFromProviderSandbox(provider).catch(() => {
        logger.warn('Chat sandbox editor transport cleanup failed', { sandboxId: sandbox.id });
      });
    }
  }
};
