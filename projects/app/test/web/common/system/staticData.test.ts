import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import { clientInitData } from '@/web/common/system/staticData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { normalizeBrandFeConfigs } from '@/web/common/brand/utils';

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  return {
    getSystemInitData: vi.fn<(bufferId?: string) => Promise<InitDateResponse>>()
  };
});

afterAll(() => vi.unstubAllGlobals());

vi.mock('@/web/common/system/api', () => ({
  getSystemInitData: mocks.getSystemInitData,
  getMyModels: vi.fn(),
  getOperationalAd: vi.fn()
}));

const enabledConfig: InitDateResponse = {
  bufferId: 'config-enabled',
  systemVersion: '4.14.17',
  feConfigs: {
    systemTitle: 'FastGPT',
    show_skill: true,
    show_agent_sandbox: true,
    uploadFileMaxSize: 1000,
    uploadFileMaxAmount: 20,
    scripts: [{ src: '/test-config-script.js' }]
  }
};

describe('client system configuration cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSystemStore.setState(useSystemStore.getInitialState(), true);
  });

  it('preserves capabilities and other settings across repeated unchanged responses', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce(enabledConfig);
    await clientInitData();
    const expected = useSystemStore.getState().feConfigs;
    expect(expected.systemTitle).toBe('OmniCockpit');

    mocks.getSystemInitData.mockResolvedValue({ bufferId: enabledConfig.bufferId });
    for (let index = 0; index < 3; index++) {
      const result = await clientInitData();
      expect(result.feConfigs).toEqual(expected);
      expect(useSystemStore.getState().feConfigs).toEqual(expected);
      expect(mocks.getSystemInitData).toHaveBeenLastCalledWith(enabledConfig.bufferId);
    }
  });

  it('fetches full configuration when a cached ID no longer has capability flags', async () => {
    useSystemStore.setState({
      initDataBufferId: enabledConfig.bufferId,
      feConfigs: normalizeBrandFeConfigs()
    });
    mocks.getSystemInitData.mockImplementation(async (bufferId) =>
      bufferId === enabledConfig.bufferId ? { bufferId } : enabledConfig
    );

    const result = await clientInitData();
    expect(result.feConfigs.show_skill).toBe(true);
    expect(result.feConfigs.show_agent_sandbox).toBe(true);
    expect(useSystemStore.getState().feConfigs.uploadFileMaxAmount).toBe(20);
    expect(mocks.getSystemInitData).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('applies explicit disabled flags and removed fields without retaining stale settings', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce(enabledConfig);
    await clientInitData();
    mocks.getSystemInitData.mockResolvedValueOnce({
      bufferId: 'config-disabled',
      feConfigs: { show_skill: false, show_agent_sandbox: false }
    });
    const result = await clientInitData();
    expect(result.feConfigs.show_skill).toBe(false);
    expect(result.feConfigs.show_agent_sandbox).toBe(false);
    expect(result.feConfigs.scripts).toBeUndefined();

    mocks.getSystemInitData.mockResolvedValueOnce({ bufferId: 'config-disabled' });
    const cachedResult = await clientInitData();
    expect(cachedResult.feConfigs).toEqual(result.feConfigs);
    expect(mocks.getSystemInitData).toHaveBeenLastCalledWith('config-disabled');
  });

  it('keeps existing configuration when a refresh request fails', async () => {
    mocks.getSystemInitData.mockResolvedValueOnce(enabledConfig);
    await clientInitData();
    const expected = useSystemStore.getState().feConfigs;
    mocks.getSystemInitData.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(clientInitData(0)).rejects.toThrow('network unavailable');
    expect(useSystemStore.getState().feConfigs).toEqual(expected);
    expect(useSystemStore.getState().initDataBufferId).toBe(enabledConfig.bufferId);
  });
});
