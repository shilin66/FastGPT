import { env } from '../../../env';
import type {
  OpenSandboxConfigType,
  OpenSandboxConnectionConfig
} from '@fastgpt-sdk/sandbox-adapter';
import { randomUUID } from 'node:crypto';
import z from 'zod';
import {
  SandboxStorageSchema,
  type SandboxStorageType,
  type SandboxInstanceSchemaType
} from './type';
import { resolveSandboxWorkspacePath } from './workspace';
import { VolumeManagerAuthRejectedBeforeEffectError } from './errors';

// ---- sealosdevbox ----
export type SealosConnectionConfig = {
  baseUrl: string;
  token: string;
  sandboxId: string;
};

const getSealosProviderConfig = () => {
  if (!env.AGENT_SANDBOX_SEALOS_BASEURL || !env.AGENT_SANDBOX_SEALOS_TOKEN) {
    throw new Error('AGENT_SANDBOX_SEALOS_BASEURL / AGENT_SANDBOX_SEALOS_TOKEN required');
  }
  return {
    baseUrl: env.AGENT_SANDBOX_SEALOS_BASEURL,
    token: env.AGENT_SANDBOX_SEALOS_TOKEN
  };
};

export const getSealosConnectionConfig = (sandboxId: string): SealosConnectionConfig => ({
  ...getSealosProviderConfig(),
  sandboxId
});

// ---- opensandbox ----
const getOpenSandboxProviderConfig = () => {
  if (!env.AGENT_SANDBOX_OPENSANDBOX_BASEURL) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_BASEURL is required');
  }
  return {
    useServerProxy: env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY,
    baseUrl: env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
    apiKey: env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
    runtime: env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
  };
};

export const getOpenSandboxConnectionConfig = ({
  sessionId
}: {
  sessionId: string;
}): OpenSandboxConnectionConfig => ({
  ...getOpenSandboxProviderConfig(),
  sessionId
});

export type SandboxProviderConfig =
  | (Pick<OpenSandboxConnectionConfig, 'baseUrl' | 'apiKey' | 'useServerProxy'> & {
      provider: 'opensandbox';
      runtime: typeof env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME;
    })
  | (ReturnType<typeof getSealosProviderConfig> & {
      provider: 'sealosdevbox';
      runtime: typeof env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME;
    });

export const getSandboxProviderConfig = (): SandboxProviderConfig => {
  const provider = env.AGENT_SANDBOX_PROVIDER ?? 'opensandbox';
  switch (provider) {
    case 'opensandbox':
      return { provider, ...getOpenSandboxProviderConfig() };
    case 'sealosdevbox':
      return {
        provider,
        ...getSealosProviderConfig(),
        runtime: env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
      };
    case 'e2b':
      throw new Error('Sandbox provider "e2b" is not supported');
  }
};

export const validateSandboxConfig = (config: SandboxProviderConfig): void => {
  if (!config.baseUrl) {
    throw new Error('Sandbox provider base URL is required');
  }
  if (!['kubernetes', 'docker'].includes(config.runtime)) {
    throw new Error(`Invalid runtime: ${config.runtime}`);
  }
  if (config.provider === 'sealosdevbox' && !config.token) {
    throw new Error('Sandbox provider token is required for sealosdevbox');
  }
};

export const buildOpenSandboxCreateConfig = (
  opts: {
    volumes?: OpenSandboxConfigType['volumes'];
    resourceLimits?: OpenSandboxConfigType['resourceLimits'];
    createConfig?: OpenSandboxConfigType;
  } = {}
): OpenSandboxConfigType => {
  if (!env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO && !opts.createConfig?.image) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO is required for opensandbox provider');
  }
  return {
    image: {
      repository: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
      tag: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
    },
    ...(opts.resourceLimits ? { resourceLimits: opts.resourceLimits } : {}),
    ...opts.createConfig,
    ...(opts.volumes ? { volumes: opts.volumes } : {})
  };
};

// ---- volume-manager ----
export type VolumeManagerConfig = {
  url: string;
  token?: string;
  mountPath: string;
};
export type VolumeManagerResult = {
  volumes: OpenSandboxConfigType['volumes'];
  storage: SandboxStorageType;
};
export type PreparedVolumeManagerConfig = {
  binding: NonNullable<SandboxStorageType['volumeManager']>;
  storage: SandboxStorageType;
  mountPath: string;
  token?: string;
};

const claimNameSchema = z.string().regex(/^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/);
const volumeResponseSchema = z.object({
  claimName: claimNameSchema,
  created: z.boolean().optional()
});

export const getVolumeManagerServiceConfig = () => {
  if (!env.AGENT_SANDBOX_ENABLE_VOLUME) return undefined;
  if (!env.AGENT_SANDBOX_VOLUME_MANAGER_URL) {
    throw new Error(
      'AGENT_SANDBOX_VOLUME_MANAGER_URL is required when AGENT_SANDBOX_ENABLE_VOLUME=true'
    );
  }
  const url = new URL(env.AGENT_SANDBOX_VOLUME_MANAGER_URL);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid volume manager binding URL');
  }
  resolveSandboxWorkspacePath({
    workspaceRoot: env.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH,
    path: '.'
  });
  return {
    baseUrl: url.href.replace(/\/+$/, ''),
    protocol: env.AGENT_SANDBOX_VOLUME_MANAGER_PROTOCOL,
    token: env.AGENT_SANDBOX_VOLUME_MANAGER_TOKEN
  };
};

export const prepareVolumeManagerConfig = ({
  sandboxId,
  previous,
  action = 'ensure'
}: {
  sandboxId: string;
  previous?: Pick<SandboxInstanceSchemaType, 'storage' | 'metadata'> | null;
  action?: 'ensure' | 'delete';
}): PreparedVolumeManagerConfig | undefined => {
  const storage = SandboxStorageSchema.parse(previous?.storage ?? {});
  const hasVolume = !!(
    storage.volumeManager ||
    storage.volumes?.length ||
    previous?.metadata?.volumeEnabled
  );
  const service = getVolumeManagerServiceConfig();
  if (!service) {
    if (hasVolume)
      throw new Error('Sandbox volume cleanup requires the volume manager to be enabled');
    return undefined;
  }
  if (action === 'delete' && previous?.metadata?.volumeEnabled === false && !hasVolume)
    return undefined;
  if (!sandboxId || /[\u0000-\u001f\u007f]/.test(sandboxId))
    throw new Error('Invalid volume sessionId');
  const { baseUrl, protocol, token } = service;
  const savedBinding = storage.volumeManager;
  if (savedBinding && (savedBinding.baseUrl !== baseUrl || savedBinding.protocol !== protocol)) {
    throw new Error('Sandbox volume manager binding does not match current configuration');
  }
  if (!savedBinding && protocol === 'claimName' && (previous || action === 'delete')) {
    throw new Error('An existing Sandbox volume requires its volume manager binding');
  }
  const volume = storage.volumes?.[0];
  if (
    storage.volumes?.length &&
    (storage.volumes.length !== 1 || volume?.name !== 'workspace' || !volume.claimName)
  ) {
    throw new Error('Invalid Sandbox workspace volume binding');
  }
  if (volume?.claimName) claimNameSchema.parse(volume.claimName);
  if (savedBinding?.ensured && !volume?.claimName)
    throw new Error('Invalid confirmed volume binding');
  const mountPath =
    volume?.mountPath ?? storage.mountPath ?? env.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH;
  if (storage.mountPath && storage.mountPath !== mountPath)
    throw new Error('Invalid Sandbox volume mount binding');
  resolveSandboxWorkspacePath({ workspaceRoot: mountPath, path: '.' });
  if (
    volume?.subPath !== undefined &&
    (!volume.subPath ||
      volume.subPath.startsWith('/') ||
      volume.subPath.split('/').some((part) => !part || part === '.' || part === '..') ||
      /[\u0000-\u001f\u007f\\]/.test(volume.subPath))
  ) {
    throw new Error('Invalid Sandbox volume subPath binding');
  }
  const target =
    savedBinding?.target ?? (protocol === 'claimName' ? `fastgpt-${randomUUID()}` : sandboxId);
  if (protocol === 'claimName') {
    claimNameSchema.parse(target);
    if (savedBinding && volume?.claimName !== target)
      throw new Error('Sandbox volume claim does not match its binding');
  } else if (target !== sandboxId) {
    throw new Error('Sandbox volume sessionId does not match its binding');
  }
  const binding = {
    protocol,
    baseUrl,
    target,
    ensured: savedBinding?.ensured ?? !!volume?.claimName
  };
  return {
    binding,
    token,
    mountPath,
    storage: {
      ...storage,
      ...(!volume && protocol === 'claimName' ? buildVolumeConfig(target, mountPath).storage : {}),
      volumeManager: binding
    }
  };
};
export const buildVolumeConfig = (claimName: string, mountPath: string): VolumeManagerResult => {
  return {
    volumes: [{ name: 'workspace', pvc: { claimName }, mountPath }],
    storage: {
      volumes: [{ name: 'workspace', claimName, mountPath }],
      mountPath
    }
  };
};
export const ensureSessionVolume = async (
  sessionId: string,
  prepared = prepareVolumeManagerConfig({ sandboxId: sessionId, previous: {} })
): Promise<string> => {
  if (!prepared) throw new Error('Volume manager is disabled');
  const { binding, token, storage } = prepared;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${binding.baseUrl}/v1/volumes/ensure`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ [binding.protocol]: binding.target })
  });
  if (!res.ok) {
    if (res.status === 401) throw new VolumeManagerAuthRejectedBeforeEffectError({ status: 401 });
    throw new Error(`volume-manager error: ${res.status} ${await res.text()}`);
  }
  const { claimName, created } = volumeResponseSchema.parse(await res.json());
  const expectedClaim = storage.volumes?.[0]?.claimName;
  if (
    (binding.protocol === 'claimName' && claimName !== binding.target) ||
    (expectedClaim && claimName !== expectedClaim)
  ) {
    throw new Error('Volume manager response claim does not match the persisted binding');
  }
  if (binding.protocol === 'claimName' && created === undefined)
    throw new Error('Volume manager response is missing created');
  if (binding.ensured && created === true)
    throw new Error('Previously confirmed Sandbox volume was recreated');
  return claimName;
};
export const deleteSessionVolume = async (
  sessionId: string,
  prepared = prepareVolumeManagerConfig({ sandboxId: sessionId, action: 'delete' })
): Promise<void> => {
  if (!prepared) return;
  const { binding, token } = prepared;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${binding.baseUrl}/v1/volumes/${encodeURIComponent(binding.target)}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`volume-manager error: ${res.status} ${await res.text()}`);
  }
};

export const getVolumeManagerConfig = async (
  sandboxId: string,
  prepared = prepareVolumeManagerConfig({ sandboxId, previous: {} })
): Promise<VolumeManagerResult | undefined> => {
  if (!prepared) return undefined;
  const claimName = await ensureSessionVolume(sandboxId, prepared);
  const volume = prepared.storage.volumes?.[0] ?? {
    name: 'workspace',
    claimName,
    mountPath: prepared.mountPath
  };
  const { claimName: _claim, ...mount } = volume;
  return {
    volumes: [{ ...mount, pvc: { claimName } }],
    storage: {
      ...prepared.storage,
      volumes: [{ ...volume, claimName }],
      mountPath: prepared.mountPath,
      volumeManager: { ...prepared.binding, ensured: true }
    }
  };
};
