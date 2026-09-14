import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import type { NextApiRequest } from 'next';
import { resolveSandboxProxyTarget } from './proxyUtils';
import { readSandboxProxySession } from './proxyTicket';
import { authSkillByTmbId } from '@fastgpt/service/support/permission/agentSkill/auth';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { assertTeamActive } from '@fastgpt/service/support/user/team/status';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
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
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/config';

const denied = () => Object.assign(new Error('Access denied'), { statusCode: 403 });
const unauthorized = () => Object.assign(new Error('Unauthorized'), { statusCode: 401 });

const getSandbox = async (sandboxId: string) => {
  const provider = getSandboxProviderConfig().provider;
  const generation = /^ws-([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/.exec(
    sandboxId
  )?.[1];
  const matches = await MongoSandboxInstance.find({
    provider,
    ...(generation ? { workspaceGeneration: generation, sourceType: 'skillEdit' } : { sandboxId })
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
      generation: sandbox.workspaceGeneration
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
  } else if (
    !sandbox.userId ||
    sandbox.userId !== grant.userId ||
    (sandbox.runtimeUserId && sandbox.runtimeUserId !== grant.userId)
  )
    throw denied();
  return resolveSandboxProxyTarget(sandbox.metadata?.endpoint, grant.targetPort);
};

export const authorizeSandboxProxyGrant = async ({
  req,
  expectedWorkspaceGeneration,
  renewal = false,
  ...scope
}: SandboxProxyScope & {
  req: NextApiRequest;
  expectedWorkspaceGeneration?: string;
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
  const grant = {
    ...scope,
    ...getSource(sandbox),
    provider: sandbox.provider,
    userId: principal.userId,
    teamId: principal.teamId,
    tmbId: principal.tmbId,
    ...(sandbox.workspaceGeneration ? { workspaceGeneration: sandbox.workspaceGeneration } : {})
  };
  await checkResource({ grant, sandbox });
  return { grant, sessionId: principal.sessionId };
};

export const getSandboxProxyTarget = async ({
  req,
  ...scope
}: SandboxProxyScope & { req: NextApiRequest }): Promise<string> => {
  const values = (req.headers.cookie ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${SANDBOX_PROXY_COOKIE}=`));
  const session =
    values.length === 1 ? values[0].slice(SANDBOX_PROXY_COOKIE.length + 1) : undefined;
  if (!session) throw unauthorized();
  const grant = await readSandboxProxySession({ session, ...scope });
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
      workspaceGeneration: grant.workspaceGeneration ?? { $exists: false }
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
