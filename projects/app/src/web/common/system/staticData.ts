import { getSystemInitData } from '@/web/common/system/api';
import { normalizeBrandFeConfigs } from '@/web/common/brand/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';

import { useSystemStore } from './useSystemStore';

export const clientInitData = async (
  retry = 3
): Promise<{
  feConfigs: FastGPTFeConfigsType;
}> => {
  try {
    const { initDataBufferId, feConfigs: cachedFeConfigs } = useSystemStore.getState();
    const hasCapabilityConfig =
      typeof cachedFeConfigs.show_skill === 'boolean' &&
      typeof cachedFeConfigs.show_agent_sandbox === 'boolean';
    const res = await getSystemInitData(hasCapabilityConfig ? initDataBufferId : undefined);
    const feConfigs = res.feConfigs ? normalizeBrandFeConfigs(res.feConfigs) : undefined;
    const normalizedRes = {
      ...res,
      feConfigs
    };
    useSystemStore.getState().initStaticData(normalizedRes);

    return {
      feConfigs: feConfigs || useSystemStore.getState().feConfigs || {}
    };
  } catch (error) {
    if (retry > 0) {
      await delay(500);
      return clientInitData(retry - 1);
    }
    return Promise.reject(error);
  }
};
