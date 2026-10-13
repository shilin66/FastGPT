import type { OpenSandboxConfigType } from '@fastgpt-sdk/sandbox-adapter';
import { env } from '../../../env';
import {
  getSandboxProviderScope,
  prepareVolumeManagerConfig,
  type VolumeManagerResult
} from './config';
import { SandboxOperationConflict } from './lease';
import { getSandboxOwnership } from './ownership';
import { getInstanceBinding } from './operation';
import { MongoSandboxInstance } from './schema';
import { SandboxMetadataSchema, type SandboxInstanceSchemaType } from './type';

export const canRecoverMissingRuntime = (instance: SandboxInstanceSchemaType): boolean => {
  const operation = instance.operation;
  if (
    instance.provider !== 'opensandbox' ||
    env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME !== 'docker' ||
    instance.sourceType !== 'appRuntime' ||
    instance.reuseScope !== 'user' ||
    instance.deleteTime ||
    instance.forceDeletion ||
    instance.providerScope !== getSandboxProviderScope(instance.provider) ||
    !instance.metadata?.providerSandboxId ||
    !instance.metadata.runtimeConfig?.recoverable ||
    !instance.storage?.volumeManager?.ensured ||
    !instance.storage.volumes?.[0]?.claimName ||
    operation?.effectState === 'pending' ||
    operation?.failureDisposition === 'unknown'
  )
    return false;
  if (instance.status === 'failed') {
    return (
      operation?.type === 'start' &&
      operation.checkpoint === 'pending' &&
      operation.effectState === 'idle' &&
      operation.failureDisposition === 'retryable' &&
      operation.error?.code === 'sandbox_unavailable'
    );
  }
  return ['running', 'stopped'].includes(instance.status);
};

export const prepareMissingRuntimeRecovery = (
  instance: SandboxInstanceSchemaType | null
): { createConfig: OpenSandboxConfigType; volumeConfig: VolumeManagerResult } => {
  const unavailable = () =>
    new SandboxOperationConflict('Selected Sandbox provider no longer exists');
  if (!instance || !canRecoverMissingRuntime(instance)) throw unavailable();
  getSandboxOwnership(instance);
  const saved = SandboxMetadataSchema.shape.runtimeConfig.parse(instance.metadata?.runtimeConfig);
  if (!saved) throw unavailable();
  const prepared = prepareVolumeManagerConfig({
    sandboxId: instance.sandboxId,
    previous: instance
  });
  const volume = prepared?.storage.volumes?.[0];
  if (!prepared?.binding.ensured || !volume?.claimName || !instance.storage) throw unavailable();
  const { claimName, ...mount } = volume;
  return {
    createConfig: {
      image: saved.image,
      entrypoint: saved.entrypoint,
      env: saved.env,
      metadata: saved.metadata,
      resourceLimits: saved.resourceLimits ?? instance.limit ?? undefined,
      timeoutSeconds: saved.timeoutSeconds
    },
    volumeConfig: {
      // Mount the confirmed claim directly; ensure may recreate a missing claim as an empty volume.
      volumes: [
        {
          ...mount,
          pvc: { claimName, createIfNotExists: false, deleteOnSandboxTermination: false }
        }
      ],
      storage: instance.storage
    }
  };
};

export const findCompletedRuntimeRecovery = async (instance: SandboxInstanceSchemaType) => {
  if (!instance.operation?.id || !canRecoverMissingRuntime(instance)) return null;
  return MongoSandboxInstance.findOne({
    ...getInstanceBinding(instance, true),
    'metadata.providerSandboxId': { $ne: instance.metadata?.providerSandboxId },
    status: 'running',
    deleteTime: null,
    forceDeletion: { $exists: false },
    'operation.type': 'start',
    'operation.checkpoint': 'ready',
    'operation.recoveredFromOperationId': instance.operation.id,
    'operation.failureDisposition': { $ne: 'unknown' },
    'operation.error': { $exists: false }
  }).lean();
};
