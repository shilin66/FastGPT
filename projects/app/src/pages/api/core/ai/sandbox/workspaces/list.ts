import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  getSandboxDisplayFields,
  getSandboxTechnicalName
} from '@fastgpt/service/core/ai/sandbox/display';
import { getExistingSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { env } from '@fastgpt/service/env';
import {
  SandboxWorkspacesListBodySchema,
  type SandboxWorkspacesListBody,
  type SandboxWorkspacesListResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/management';
import { authSandboxManagement } from '@/service/core/sandbox/management';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default NextAPI(
  async (
    req: ApiRequestProps<SandboxWorkspacesListBody>
  ): Promise<SandboxWorkspacesListResponse> => {
    const { sourceType, sourceId, page, pageSize, search } = SandboxWorkspacesListBodySchema.parse(
      req.body
    );
    const { teamId, sourceName } = await authSandboxManagement(req, { sourceType, sourceId });
    if (
      env.AGENT_SANDBOX_PROVIDER !== 'opensandbox' ||
      env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME !== 'docker'
    ) {
      return { supported: false, total: 0, list: [] };
    }
    const filter = {
      provider: 'opensandbox',
      sourceType,
      sourceId,
      teamId,
      deleteTime: null,
      ...(search
        ? {
            $or: [
              { sandboxId: { $regex: escapeRegex(search), $options: 'i' } },
              { sourceChatId: { $regex: escapeRegex(search), $options: 'i' } },
              { sessionId: { $regex: escapeRegex(search), $options: 'i' } },
              { runtimeUserId: { $regex: escapeRegex(search), $options: 'i' } },
              { 'metadata.providerSandboxId': { $regex: escapeRegex(search), $options: 'i' } }
            ]
          }
        : {})
    };
    const [instances, total] = await Promise.all([
      MongoSandboxInstance.find(filter)
        .sort({ lastActiveAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      MongoSandboxInstance.countDocuments(filter)
    ]);
    const providerStatuses = await batchRun(
      instances,
      async (doc) => {
        const providerSandboxId = doc.metadata?.providerSandboxId;
        if (!providerSandboxId) return 'unknown' as const;
        try {
          const provider = getExistingSandboxClient(doc, { requestTimeoutSeconds: 5 }).provider;
          if (!('inspectExisting' in provider) || typeof provider.inspectExisting !== 'function') {
            return 'unknown' as const;
          }
          const remote = await provider.inspectExisting(providerSandboxId);
          if (!remote) return 'absent' as const;
          if (remote.status.state === 'Running') return 'running' as const;
          if (remote.status.state === 'Stopped') return 'stopped' as const;
          if (remote.status.state === 'UnExist') return 'absent' as const;
          if (remote.status.state === 'Error') return 'error' as const;
          return 'transitioning' as const;
        } catch {
          return 'unknown' as const;
        }
      },
      4
    );
    return {
      supported: true,
      total,
      list: instances.map((doc, index) => {
        const hasPersistentStorage = !!(
          doc.storage?.volumeManager?.ensured && doc.storage.volumes?.[0]?.claimName
        );
        const settled =
          ['running', 'stopped'].includes(doc.status) &&
          (!doc.operation ||
            (!doc.operation.error &&
              doc.operation.failureDisposition !== 'unknown' &&
              ['ready', 'completed', 'provider_stopped', 'provider_released'].includes(
                doc.operation.checkpoint
              )));
        const resumableDelete =
          doc.status === 'deleting' &&
          doc.operation?.type === 'delete' &&
          ['provider_deleted', 'volume_deleted'].includes(doc.operation.checkpoint) &&
          !!doc.operation.error &&
          doc.operation.failureDisposition === 'retryable';
        const providerSandboxId = doc.metadata?.providerSandboxId;
        const providerStatus = providerStatuses[index];
        return {
          sandboxId: doc.sandboxId,
          sourceType,
          sourceId,
          sourceName,
          ...getSandboxDisplayFields({ ...doc, sourceType }),
          runtimeUserId: doc.runtimeUserId,
          sourceChatId: doc.sourceChatId,
          sessionId: doc.sessionId,
          technicalName: getSandboxTechnicalName({
            sourceType,
            sourceId,
            runtimeUserId: doc.runtimeUserId,
            reuseScope: doc.reuseScope,
            sourceChatId: doc.sourceChatId,
            sessionId: doc.sessionId,
            sandboxId: doc.sandboxId
          }),
          providerSandboxId,
          storageClaimName: doc.storage?.volumes?.[0]?.claimName,
          status: doc.status,
          providerStatus,
          statusMismatch:
            (providerStatus === 'running' &&
              (doc.status === 'stopped' || doc.status === 'failed' || !!doc.releasedAt)) ||
            (providerStatus === 'stopped' && doc.status === 'running') ||
            (providerStatus === 'absent' && doc.status === 'running'),
          operation: doc.operation
            ? {
                type: doc.operation.type,
                checkpoint: doc.operation.checkpoint,
                failureDisposition: doc.operation.failureDisposition
              }
            : undefined,
          createdAt: doc.createdAt.toISOString(),
          lastActiveAt: doc.lastActiveAt.toISOString(),
          releasedAt: doc.releasedAt?.toISOString(),
          hasPersistentStorage,
          canRelease: !!(settled && hasPersistentStorage && providerSandboxId && !doc.releasedAt),
          canDelete: !!(settled || resumableDelete || doc.status === 'archived')
        };
      })
    };
  }
);
