/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import type {
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkills/type';
import { createSandbox, type ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { OpenSandboxConfigType, SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import type { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';
import { env } from '../../env';
import { resolveSandboxWorkspacePath } from '../ai/sandbox/workspace';
import type { SandboxProviderConfig } from '../ai/sandbox/config';

export type SandboxDefaults = {
  defaultImage: SandboxImageConfigType;
  workDirectory: string;
  targetPort: number;
  entrypoint: string;
};

export type SkillSizeLimits = {
  maxUploadBytes: number; // Compressed upload size limit
  maxUncompressedBytes: number; // Uncompressed size after extraction (Zip Bomb guard)
  maxDownloadBytes: number; // Download from MinIO/S3
  maxSandboxPackageBytes: number; // Sandbox directory size before zip
};

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

function createUnsupportedCreateConfigError(provider: SandboxProviderType): Error {
  return new Error(
    `Sandbox provider "${provider}" does not support custom image/entrypoint/env/metadata through @fastgpt/sandbox. Agent skill sandboxes currently require those capabilities.`
  );
}

/**
 * Get sandbox default settings
 */
export function getSandboxDefaults(): SandboxDefaults {
  return {
    defaultImage: {
      repository: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO ?? 'fastgpt-agent-sandbox',
      tag: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG ?? 'latest'
    },
    workDirectory: env.AGENT_SANDBOX_ENABLE_VOLUME
      ? resolveSandboxWorkspacePath({
          workspaceRoot: env.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH,
          path: '.'
        })
      : '/home/sandbox/workspace',
    targetPort: 44772,
    entrypoint: '/home/sandbox/entrypoint.sh'
    // entrypoint: env.AGENT_SANDBOX_OPENSANDBOX_ENTRYPOINT ?? '/home/sandbox/entrypoint.sh'
  };
}

export function getSkillEditWorkspaceRoot(existing?: { metadata?: unknown }): string {
  if (!existing) return `${getSandboxDefaults().workDirectory}/edit`;
  if (
    existing.metadata &&
    typeof existing.metadata === 'object' &&
    'workspaceRoot' in existing.metadata
  ) {
    if (typeof existing.metadata.workspaceRoot !== 'string') {
      throw new Error('Invalid Sandbox workspace path');
    }
    return resolveSandboxWorkspacePath({
      workspaceRoot: existing.metadata.workspaceRoot,
      path: '.'
    });
  }
  // Legacy drafts lived in the container, not in the configured volume. Do not
  // silently switch directories and initialize over an apparently empty draft.
  return '/home/sandbox/workspace';
}

/**
 * Get skill size limits from environment variables
 */
export function getSkillSizeLimits(): SkillSizeLimits {
  return {
    maxUploadBytes: env.AGENT_SKILL_MAX_UPLOAD_SIZE ?? 50 * 1024 * 1024,
    maxUncompressedBytes: env.AGENT_SKILL_MAX_UNCOMPRESSED_SIZE ?? 200 * 1024 * 1024,
    maxDownloadBytes: env.AGENT_SKILL_MAX_DOWNLOAD_SIZE ?? 200 * 1024 * 1024,
    maxSandboxPackageBytes: env.AGENT_SKILL_MAX_SANDBOX_SIZE ?? 200 * 1024 * 1024
  };
}

/**
 * Build a provider-specific sandbox adapter behind the unified ISandbox interface.
 * For providers that require a sandboxId at construction time, pass providerSandboxId.
 */
export function buildSandboxAdapter(
  providerConfig: SandboxProviderConfig,
  props: {
    providerSandboxId: string;
    createConfig?: OpenSandboxConfigType;
  }
): ISandbox {
  switch (providerConfig.provider) {
    case 'opensandbox':
      return createSandbox(
        'opensandbox',
        {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime,
          useServerProxy: providerConfig.useServerProxy,
          sessionId: props.providerSandboxId
        },
        props.createConfig
      );

    case 'sealosdevbox': {
      if (!props.providerSandboxId) {
        throw new Error(
          'Sandbox provider "sealosdevbox" requires providerSandboxId when initializing the adapter'
        );
      }
      if (props.createConfig) {
        throw createUnsupportedCreateConfigError(providerConfig.provider);
      }

      const connection = {
        baseUrl: providerConfig.baseUrl,
        token: providerConfig.token,
        sandboxId: props.providerSandboxId
      };

      return createSandbox('sealosdevbox', connection);
    }

    default:
      return assertNever(providerConfig);
  }
}

/**
 * Connect to an existing provider sandbox and return a unified adapter instance.
 *
 * OpenSandbox requires an explicit SDK connect call. Other providers, like
 * Sealos Devbox, identify the target sandbox during adapter construction.
 */
export async function connectToProviderSandbox(
  providerConfig: SandboxProviderConfig,
  providerSandboxId: string
): Promise<ISandbox> {
  const sandbox = buildSandboxAdapter(providerConfig, { providerSandboxId });

  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).connect(providerSandboxId);
  }

  return sandbox;
}

/**
 * Release any provider-specific client resources tied to the sandbox handle.
 *
 * `close()` is not part of the shared ISandbox contract today, so keep the
 * OpenSandbox branch here instead of leaking adapter-specific casts into
 * business code. Other providers currently have no equivalent method.
 */
export async function disconnectFromProviderSandbox(sandbox: ISandbox): Promise<void> {
  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).close();
  }
}

/**
 * Resolve the externally reachable endpoint for a sandbox service.
 *
 * `getEndpoint()` is an OpenSandbox-specific extension. If another provider adds
 * a similar capability later, extend this function instead of branching again
 * in application code.
 */
export async function getProviderSandboxEndpoint(
  sandbox: ISandbox,
  port: number
): Promise<SkillSandboxEndpointType> {
  if (sandbox.provider === 'opensandbox') {
    const endpoint = await (sandbox as OpenSandboxAdapter).getEndpoint(port);
    return {
      host: endpoint.host,
      port: endpoint.port,
      protocol: endpoint.protocol,
      url: endpoint.url
    };
  }

  throw new Error(
    `Sandbox provider "${sandbox.provider}" does not expose endpoint capability through @fastgpt/sandbox. This edit-debug workflow currently requires opensandbox-compatible endpoint support.`
  );
}

/** Probe code-server itself through the authenticated provider, not the execd gateway. */
export async function waitForSkillEditorReady(
  sandbox: Pick<ISandbox, 'execute'>,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const intervalMs = options?.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const result = await sandbox.execute(
        `python3 - <<'PY'
import http.client, json, sys
try:
    connection = http.client.HTTPConnection('127.0.0.1', 8080, timeout=3)
    connection.request('GET', '/healthz')
    response = connection.getresponse()
    if response.status != 200:
        sys.exit(1)
    health = json.loads(response.read(4096))
    if not isinstance(health, dict) or health.get('status') not in ('alive', 'expired'):
        sys.exit(1)
    print('skill-editor-ready')
except Exception:
    sys.exit(1)
PY`,
        { timeoutMs: Math.min(5_000, deadline - Date.now()), maxOutputBytes: 1024 }
      );
      if (result.exitCode === 0 && result.stdout.trim() === 'skill-editor-ready') return;
    } catch {
      // The container may be running before its editor has finished starting.
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remainingMs)));
    }
  }

  throw new Error(
    `Skill editor did not become ready within ${timeoutMs / 1000}s; check the image supports code-server on port 8080`
  );
}

/**
 * Build container env vars for the sandbox process.
 */
export function buildBaseContainerEnv(
  sessionId: string,
  workDirectory: string,
  enableCodeServer: boolean
): Record<string, string> {
  return {
    FASTGPT_SESSION_ID: sessionId,
    FASTGPT_WORKDIR: workDirectory,
    FASTGPT_ENABLE_CODE_SERVER: enableCodeServer ? 'true' : 'false'
  };
}
