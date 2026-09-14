import { posix } from 'node:path';
import type { SkillEditWorkspace } from '@fastgpt/global/core/agentSkills/workspace';
import type { SandboxInstanceSchemaType } from '../../ai/sandbox/type';
import { isSandboxPublishRejected } from '../../ai/sandbox/utils';

export const isEditWorkspaceOperationComplete = (
  instance: Pick<SandboxInstanceSchemaType, 'status' | 'operation' | 'deleteTime'>
) => {
  if (instance.deleteTime || !['running', 'stopped'].includes(instance.status)) return false;
  if (instance.operation?.failureDisposition === 'unknown') return false;
  if (isSandboxPublishRejected(instance)) return true;
  const operation = instance.operation;
  if (!operation) return true;
  if (operation.error) return false;
  return (
    (['provision', 'start', 'editInitialize', 'publish', 'resetWorkspace', 'debug'].includes(
      operation.type
    ) &&
      operation.checkpoint === 'ready') ||
    (instance.status === 'stopped' &&
      operation.type === 'stop' &&
      operation.checkpoint === 'provider_stopped')
  );
};

export const getEditWorkspaceVolume = (instance: SandboxInstanceSchemaType) => {
  const root = instance.metadata?.workspaceRoot;
  const volumes = instance.storage?.volumes;
  if (
    !instance.metadata?.volumeEnabled ||
    !root ||
    !posix.isAbsolute(root) ||
    posix.normalize(root) !== root ||
    /[\u0000-\u001f\u007f\\$`]/.test(root) ||
    volumes?.length !== 1
  )
    return;
  const volume = volumes[0];
  if (
    !volume.claimName ||
    volume.subPath ||
    !posix.isAbsolute(volume.mountPath) ||
    volume.mountPath === '/' ||
    posix.normalize(volume.mountPath) !== volume.mountPath ||
    !root.startsWith(`${volume.mountPath}/`) ||
    posix.dirname(root) !== volume.mountPath ||
    instance.storage?.mountPath !== volume.mountPath
  )
    return;
  return { root, volume };
};

export const projectEditWorkspaceState = ({
  instance,
  currentVersionId,
  providerRuntime = 'docker'
}: {
  instance: SandboxInstanceSchemaType | null;
  currentVersionId: string | null;
  providerRuntime?: string;
}): SkillEditWorkspace => {
  const baseVersionId = instance?.baseVersionId ? String(instance.baseVersionId) : null;
  const initialDeploymentIncomplete =
    instance?.sourceType === 'skillEdit' &&
    !baseVersionId &&
    !(instance.metadata && 'storage' in instance.metadata);
  const reason: SkillEditWorkspace['resetUnavailableReason'] = (() => {
    if (!instance) return 'missing_workspace';
    if (instance.provider !== 'opensandbox' || providerRuntime !== 'docker')
      return 'unsupported_provider';
    if (!getEditWorkspaceVolume(instance)) return 'not_persistent';
    if (
      (instance.operation?.error && !isSandboxPublishRejected(instance)) ||
      instance.operation?.failureDisposition === 'unknown' ||
      instance.status === 'failed' ||
      !instance.metadata?.providerSandboxId ||
      instance.status === 'stopped'
    )
      return 'recovery_required';
    if (!isEditWorkspaceOperationComplete(instance)) return 'operation_in_progress';
  })();
  return {
    status: instance?.status ?? 'absent',
    sandboxId: instance?.sandboxId,
    generation: instance?.workspaceGeneration,
    baseVersionId,
    currentVersionId,
    stale:
      !!instance &&
      !initialDeploymentIncomplete &&
      (!baseVersionId || baseVersionId !== currentVersionId),
    lastActiveAt: instance?.lastActiveAt?.toISOString(),
    resetAvailable: reason === undefined,
    resetUnavailableReason: reason,
    ...(instance?.operation
      ? {
          operation: {
            id: instance.operation.id,
            type: instance.operation.type,
            checkpoint: instance.operation.checkpoint,
            updatedAt: instance.operation.updatedAt.toISOString(),
            heartbeatAt: instance.operation.heartbeatAt?.toISOString(),
            errorCode: instance.operation.error?.code,
            failureDisposition: instance.operation.failureDisposition
          }
        }
      : {})
  };
};
