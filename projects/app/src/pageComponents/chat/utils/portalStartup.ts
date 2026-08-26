import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/global/openapi/core/chat/api';

type PortalStartupDecisionInput = {
  routeAppId: string;
  isRecentlyUsedReady: boolean;
  recentlyUsedApps: GetRecentlyUsedAppsResponseType;
};

export const getPortalStartupDecision = ({
  routeAppId,
  isRecentlyUsedReady,
  recentlyUsedApps
}: PortalStartupDecisionInput) => {
  if (!isRecentlyUsedReady) return;

  const lastUsedApp = recentlyUsedApps[0];

  return {
    appIdToRestore: routeAppId ? undefined : lastUsedApp?.appId,
    isRecentlyUsedExpanded: !lastUsedApp
  };
};
