export type EnsureResult = {
  claimName: string;
  created: boolean;
};

export type VolumeAddressMode = 'sessionId' | 'claimName';

export interface IVolumeDriver {
  ensure(sessionId: string, mode?: VolumeAddressMode): Promise<EnsureResult>;
  remove(sessionId: string, mode?: VolumeAddressMode): Promise<void>;
}
