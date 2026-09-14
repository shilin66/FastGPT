import type { SandboxInstanceSchemaType } from './type';

export const isSandboxPublishRejected = (
  instance: Pick<SandboxInstanceSchemaType, 'status' | 'operation' | 'deleteTime'>
) =>
  !instance.deleteTime &&
  instance.status === 'running' &&
  instance.operation?.type === 'publish' &&
  instance.operation.checkpoint === 'rejected' &&
  instance.operation.failureDisposition === 'retryable' &&
  instance.operation.error?.code === 'invalid_package';
