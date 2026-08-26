import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';
import { FASTGPT_VISIBLE_DEFAULTS, OMNICOCKPIT_ASSETS, OMNICOCKPIT_NAME } from './constants';

export const getVisibleSystemTitle = (title?: string) => {
  if (!title || title === FASTGPT_VISIBLE_DEFAULTS.systemTitle) return OMNICOCKPIT_NAME;
  return title;
};

export const getVisibleFavicon = (favicon?: string) => {
  if (!favicon || favicon === FASTGPT_VISIBLE_DEFAULTS.favicon) return OMNICOCKPIT_ASSETS.favicon;
  return favicon;
};

const isFastGPTVisibleLink = (value?: string) => {
  if (!value) return false;
  return /fastgpt|labring/i.test(value);
};

export const normalizeBrandFeConfigs = (feConfigs?: FastGPTFeConfigsType): FastGPTFeConfigsType => {
  const nextConfigs = feConfigs || {};

  return {
    ...nextConfigs,
    systemTitle: getVisibleSystemTitle(nextConfigs.systemTitle),
    favicon: getVisibleFavicon(nextConfigs.favicon),
    concatMd: isFastGPTVisibleLink(nextConfigs.concatMd) ? '' : nextConfigs.concatMd,
    docUrl: isFastGPTVisibleLink(nextConfigs.docUrl) ? '' : nextConfigs.docUrl,
    openAPIDocUrl: isFastGPTVisibleLink(nextConfigs.openAPIDocUrl) ? '' : nextConfigs.openAPIDocUrl,
    submitPluginRequestUrl: isFastGPTVisibleLink(nextConfigs.submitPluginRequestUrl)
      ? ''
      : nextConfigs.submitPluginRequestUrl,
    show_git: false
  };
};
