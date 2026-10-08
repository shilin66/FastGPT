import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { env } from '../../../env';
import { SandboxEditorError } from './editor';
import { getProviderSandboxEndpoint, getSandboxDefaults } from '../../agentSkills/sandboxConfig';
import type { SkillSandboxEndpointType } from '@fastgpt/global/core/agentSkills/type';
import { SandboxProtocolEnum } from '@fastgpt/global/core/agentSkills/constants';
import z from 'zod';

const endpointResponse = z.object({
  endpoint: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional()
});

/** Some lifecycle gateways strip application cookies; use an explicitly configured direct route. */
export const getSandboxEditorEndpoint = async (
  provider: ISandbox
): Promise<SkillSandboxEndpointType> => {
  const host = env.AGENT_SANDBOX_EDITOR_DIRECT_HOST;
  const port = getSandboxDefaults().targetPort;
  if (!host) return getProviderSandboxEndpoint(provider, port);
  try {
    if (
      provider.provider !== 'opensandbox' ||
      !provider.id ||
      !env.AGENT_SANDBOX_OPENSANDBOX_BASEURL
    )
      throw new Error('Unsupported provider');
    const api = new URL(env.AGENT_SANDBOX_OPENSANDBOX_BASEURL);
    if (api.username || api.password || api.search || api.hash) throw new Error('Invalid API URL');
    const base = api.pathname.replace(/\/+$/, '');
    api.pathname = `${base.endsWith('/v1') ? base : `${base}/v1`}/sandboxes/${encodeURIComponent(provider.id)}/endpoints/${port}`;
    api.searchParams.set('use_server_proxy', 'false');
    const response = await fetch(api, {
      headers: env.AGENT_SANDBOX_OPENSANDBOX_API_KEY
        ? { 'OPEN-SANDBOX-API-KEY': env.AGENT_SANDBOX_OPENSANDBOX_API_KEY }
        : {},
      signal: AbortSignal.timeout(8000),
      redirect: 'error'
    });
    if (!response.ok) throw new Error('Endpoint unavailable');
    const resolved = endpointResponse.parse(await response.json());
    if (Object.keys(resolved.headers ?? {}).length)
      throw new Error('Unsupported endpoint credentials');
    const target = new URL(
      resolved.endpoint.includes('://') ? resolved.endpoint : `http://${resolved.endpoint}`
    );
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      !['/', `/proxy/${port}`].includes(target.pathname)
    )
      throw new Error('Unsupported endpoint');
    target.hostname = host;
    return {
      host: target.hostname,
      port: Number(target.port || (target.protocol === 'https:' ? 443 : 80)),
      protocol: target.protocol === 'https:' ? SandboxProtocolEnum.https : SandboxProtocolEnum.http,
      url: target.toString().replace(/\/$/, '')
    };
  } catch (cause) {
    throw new SandboxEditorError('sandbox_editor_unavailable', 503, { cause });
  }
};
