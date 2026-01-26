import { loadModelProviders } from '../../../thirdProvider/fastgptPlugin/model';
import {
  type langType,
  defaultProvider,
  formatModelProviders
} from '@fastgpt/global/core/ai/provider';
import { isS3ProxyEnabled } from '../../../common/s3/proxy';

// Preload model providers
export async function preloadModelProviders(): Promise<void> {
  const { modelProviders, aiproxyIdMap } = await loadModelProviders();
  const newProviders = modelProviders.map((provider) => {
    return {
      ...provider,
      avatar: isS3ProxyEnabled()
        ? provider.avatar.replace(
            process.env.STORAGE_S3_ENDPOINT || '',
            `${process.env.FE_DOMAIN || process.env.FILE_DOMAIN || ''}${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/common/s3/proxy`
          )
        : provider.avatar
    };
  });
  const { ModelProviderListCache, ModelProviderMapCache } = formatModelProviders(newProviders);
  global.ModelProviderRawCache = newProviders;
  global.ModelProviderListCache = ModelProviderListCache;
  global.ModelProviderMapCache = ModelProviderMapCache;

  global.aiproxyIdMapCache = aiproxyIdMap;
}

export const getModelProviders = (language = 'en') => {
  return global.ModelProviderListCache[language as langType] || [];
};
export const getModelProvider = (provider?: string, language = 'en') => {
  if (!provider) {
    return defaultProvider;
  }

  return global.ModelProviderMapCache[language as langType][provider] ?? defaultProvider;
};
