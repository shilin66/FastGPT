import type { SandboxInstanceSchemaType } from './type';

export const isSandboxPublishRejected = (
  instance: Pick<SandboxInstanceSchemaType, 'status' | 'operation' | 'deleteTime'>
) =>
  !instance.deleteTime &&
  instance.status === 'running' &&
  instance.operation?.type === 'publish' &&
  instance.operation.checkpoint === 'rejected' &&
  instance.operation.failureDisposition === 'retryable' &&
  ['invalid_package', 'terminal_busy', 'terminal_probe_failed'].includes(
    instance.operation.error?.code ?? ''
  );
