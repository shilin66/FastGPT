import type {
  SandboxVolumeEnsureRequest,
  SandboxVolumeEnsureResponse,
  SandboxVolumeInspectResponse
} from '@fastgpt/global/core/ai/sandbox/volume';

export type IVolumeDriver = {
  inspect(claimName: string): Promise<SandboxVolumeInspectResponse>;
  ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse>;
  remove(claimName: string): Promise<void>;
};
