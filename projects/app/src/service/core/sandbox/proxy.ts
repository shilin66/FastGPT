import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import type { NextApiRequest } from 'next';
import { resolveSandboxProxyTarget } from './proxyUtils';
import { readSandboxProxySession } from './proxyTicket';
import { authSkillByTmbId } from '@fastgpt/service/support/permission/agentSkill/auth';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { assertTeamActive } from '@fastgpt/service/support/user/team/status';
import { WritePermissionVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { env } from '@fastgpt/service/env';
import {
  SANDBOX_PROXY_COOKIE,
  getSandboxProxyResourceId,
  type SandboxProxyGrant,
  type SandboxProxyScope
} from '@fastgpt/global/core/ai/sandbox/proxy';
import type { SandboxInstanceSchemaType } from '@fastgpt/service/core/ai/sandbox/type';
import {
  connectToProviderSandbox,
  disconnectFromProviderSandbox
} from '@fastgpt/service/core/agentSkills/sandboxConfig';
import {
  getSandboxProviderConfig,
  getSandboxProviderScope
} from '@fastgpt/service/core/ai/sandbox/config';
import { withSandboxEditorConnection } from '@fastgpt/service/core/ai/sandbox/editorActivity';

const denied = () => Object.assign(new Error('Access denied'), { statusCode: 403 });
const unauthorized = () => Object.assign(new Error('Unauthorized'), { statusCode: 401 });

const getSandbox = async (sandboxId: string) => {
  const provider = getSandboxProviderConfig().provider;
  const resource = /^(ws|ed)-([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/.exec(
    sandboxId
  );
  const matches = await MongoSandboxInstance.find({
    provider,
    ...(resource?.[1] === 'ed'
      ? { 'metadata.editor.generation': resource[2], sourceType: 'appRuntime' }
      : resource
        ? { workspaceGeneration: resource[2], sourceType: 'skillEdit' }
        : { sandboxId })
  })
    .limit(2)
    .lean();
  if (matches.length !== 1) throw denied();
  const sandbox = matches[0];
  if (!sandbox || sandbox.deleteTime) throw denied();
  if (sandbox.provider !== provider || sandbox.status !== SandboxStatusEnum.running) throw denied();
  if (
    getSandboxProxyResourceId({
      sandboxId: sandbox.sandboxId,
      generation: sandbox.workspaceGeneration,
      ...(sandbox.sourceType === 'appRuntime'
        ? { editorGeneration: sandbox.metadata?.editor?.generation }
        : {})
    }) !== sandboxId
  )
    throw denied();
  return sandbox;
};

const getSource = (sandbox: SandboxInstanceSchemaType) => {
  const sourceType =
    sandbox.sourceType ??
    (sandbox.metadata?.sandboxType === 'edit-debug' ? 'skillEdit' : 'appRuntime');
  const sourceId =
    sandbox.sourceId ?? (sourceType === 'skillEdit' ? sandbox.metadata?.skillId : sandbox.appId);
  if (!sourceId) throw denied();
  return { sourceType, sourceId };
};

const checkResource = async ({
  grant,
  sandbox
}: {
  grant: SandboxProxyGrant;
  sandbox: SandboxInstanceSchemaType;
}) => {
  const source = getSource(sandbox);
  if (
    source.sourceType !== grant.sourceType ||
    source.sourceId !== grant.sourceId ||
    sandbox.provider !== grant.provider ||
    sandbox.workspaceGeneration !== grant.workspaceGeneration ||
    String(sandbox.teamId ?? sandbox.metadata?.teamId) !== grant.teamId
  )
    throw denied();
  const member = await getTmbInfoByTmbId({ tmbId: grant.tmbId }).catch(() => {
    throw denied();
  });
  if (member.userId !== grant.userId || member.teamId !== grant.teamId) throw denied();
  await assertTeamActive(grant.teamId).catch(() => {
    throw denied();
  });
  if (source.sourceType === 'skillEdit') {
    await authSkillByTmbId({
      tmbId: grant.tmbId,
      skillId: source.sourceId,
      per: WritePermissionVal
    }).catch(() => {
      throw denied();
    });
  } else {
    const editor = sandbox.metadata?.editor;
    if (
      !env.AGENT_SANDBOX_CHAT_EDITOR_ENABLED ||
      !editor ||
      editor.status !== 'ready' ||
      !grant.runtimeUserId ||
      grant.runtimeUserId !== grant.tmbId ||
      (sandbox.runtimeUserId ?? sandbox.userId) !== grant.runtimeUserId ||
      (sandbox.userId && sandbox.userId !== grant.runtimeUserId) ||
      !grant.providerSandboxId ||
      grant.providerSandboxId !== sandbox.metadata?.providerSandboxId ||
      editor.providerSandboxId !== grant.providerSandboxId ||
      !grant.editorGeneration ||
      editor.generation !== grant.editorGeneration ||
      editor.workspaceGeneration !== sandbox.workspaceGeneration ||
      !grant.providerScope ||
      grant.providerScope !== sandbox.providerScope ||
      editor.providerScope !== grant.providerScope ||
      grant.providerScope !== getSandboxProviderScope(sandbox.provider)
    )
      throw denied();
    const { app } = await authAppByTmbId({
      appId: source.sourceId,
      tmbId: grant.tmbId,
      per: ReadPermissionVal
    }).catch(() => {
      throw denied();
    });
    if (String(app.teamId) !== grant.teamId || ('deleteTime' in app && app.deleteTime))
      throw denied();
    return resolveSandboxProxyTarget(editor.endpoint, grant.targetPort);
  }
  return resolveSandboxProxyTarget(sandbox.metadata?.endpoint, grant.targetPort);
};

export const authorizeSandboxProxyGrant = async ({
  req,
  expectedWorkspaceGeneration,
  expectedProviderSandboxId,
  expectedEditorGeneration,
  renewal = false,
  ...scope
}: SandboxProxyScope & {
  req: NextApiRequest;
  expectedWorkspaceGeneration?: string;
  expectedProviderSandboxId?: string;
  expectedEditorGeneration?: string;
  renewal?: boolean;
}): Promise<{
  grant: SandboxProxyGrant;
  sessionId: string;
}> => {
  const principal = await parseHeaderCert({ req, authToken: true }).catch(() => {
    throw unauthorized();
  });
  if (!principal.userId || !principal.sessionId) throw unauthorized();
  const sandbox = await getSandbox(scope.sandboxId);
  if (
    (expectedWorkspaceGeneration !== undefined &&
      expectedWorkspaceGeneration !== (sandbox.workspaceGeneration ?? 'legacy')) ||
    (renewal && sandbox.workspaceGeneration && expectedWorkspaceGeneration === undefined)
  )
    throw denied();
  if (
    getSource(sandbox).sourceType === 'appRuntime' &&
    (!expectedProviderSandboxId ||
      expectedProviderSandboxId !== sandbox.metadata?.providerSandboxId ||
      !expectedEditorGeneration ||
      expectedEditorGeneration !== sandbox.metadata?.editor?.generation)
  )
    throw denied();
  const grant = {
    ...scope,
    ...getSource(sandbox),
    provider: sandbox.provider,
    userId: principal.userId,
    teamId: principal.teamId,
    tmbId: principal.tmbId,
    ...(sandbox.workspaceGeneration ? { workspaceGeneration: sandbox.workspaceGeneration } : {}),
    ...(getSource(sandbox).sourceType === 'appRuntime'
      ? {
          runtimeUserId: principal.tmbId,
          providerSandboxId: sandbox.metadata?.providerSandboxId,
          providerScope: sandbox.providerScope,
          editorGeneration: sandbox.metadata?.editor?.generation
        }
      : {})
  };
  await checkResource({ grant, sandbox });
  return { grant, sessionId: principal.sessionId };
};

export const getSandboxProxyTarget = async ({
  req,
  connection,
  ...scope
}: SandboxProxyScope & {
  req: NextApiRequest;
  connection?: { id: string; mode: 'open' | 'renew' | 'close' };
}): Promise<string> => {
  const values = (req.headers.cookie ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${SANDBOX_PROXY_COOKIE}=`));
  const session =
    values.length === 1 ? values[0].slice(SANDBOX_PROXY_COOKIE.length + 1) : undefined;
  if (!session) throw unauthorized();
  const grant = await readSandboxProxySession({ session, ...scope });
  if (connection && grant.sourceType === 'appRuntime') {
    const instance = await getSandbox(grant.sandboxId);
    return withSandboxEditorConnection(instance, connection, () =>
      getSandboxProxyTargetForGrant(grant)
    );
  }
  return getSandboxProxyTargetForGrant(grant);
};

export const getSandboxProxyTargetForGrant = async (grant: SandboxProxyGrant): Promise<string> => {
  const sandbox = await getSandbox(grant.sandboxId);
  const target = await checkResource({ grant, sandbox });
  const heartbeat = await MongoSandboxInstance.updateOne(
    {
      _id: sandbox._id,
      provider: sandbox.provider,
      sandboxId: sandbox.sandboxId,
      status: SandboxStatusEnum.running,
      deleteTime: null,
      workspaceGeneration: grant.workspaceGeneration ?? { $exists: false },
      ...(grant.sourceType === 'appRuntime'
        ? {
            providerScope: grant.providerScope,
            'metadata.providerSandboxId': grant.providerSandboxId,
            'metadata.editor.generation': grant.editorGeneration
          }
        : {})
    },
    { $max: { lastActiveAt: new Date() } }
  );
  if (heartbeat.matchedCount !== 1) throw denied();
  return target;
};

/**
 * Read the code-server password from the container's config.yaml via exec.
 * Returns null if the sandbox is not found, has no providerSandboxId, or exec fails.
 */
export async function getCodeServerPasswordFromSandbox(sandboxId: string): Promise<string | null> {
  const sandbox = await getSandbox(sandboxId);
  if (!sandbox?.metadata?.providerSandboxId) return null;

  const providerConfig = getSandboxProviderConfig();
  const adapter = await connectToProviderSandbox(
    providerConfig,
    sandbox.metadata.providerSandboxId
  );
  try {
    const result = await adapter.execute(
      "grep '^password:' ~/.config/code-server/config.yaml 2>/dev/null | awk '{print $2}' | tr -d '[:space:]'"
    );
    return result.stdout.trim() || null;
  } finally {
    await disconnectFromProviderSandbox(adapter);
  }
}
