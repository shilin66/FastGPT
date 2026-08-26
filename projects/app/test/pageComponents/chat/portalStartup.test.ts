import { describe, expect, it } from 'vitest';
import { getPortalStartupDecision } from '../../../src/pageComponents/chat/utils/portalStartup';

const recentApps = [
  { appId: 'latest-app', name: 'Latest app', avatar: '' },
  { appId: 'older-app', name: 'Older app', avatar: '' }
];

describe('portal startup decision', () => {
  it('waits until recently used apps have resolved', () => {
    expect(
      getPortalStartupDecision({
        routeAppId: '',
        isRecentlyUsedReady: false,
        recentlyUsedApps: []
      })
    ).toBeUndefined();
  });

  it('restores the first recently used app and collapses the recent list', () => {
    expect(
      getPortalStartupDecision({
        routeAppId: '',
        isRecentlyUsedReady: true,
        recentlyUsedApps: recentApps
      })
    ).toEqual({
      appIdToRestore: 'latest-app',
      isRecentlyUsedExpanded: false
    });
  });

  it('keeps an explicitly selected app while retaining the collapsed default', () => {
    expect(
      getPortalStartupDecision({
        routeAppId: 'explicit-app',
        isRecentlyUsedReady: true,
        recentlyUsedApps: recentApps
      })
    ).toEqual({
      appIdToRestore: undefined,
      isRecentlyUsedExpanded: false
    });
  });

  it('keeps the app selector and expands recent use when no record exists', () => {
    expect(
      getPortalStartupDecision({
        routeAppId: '',
        isRecentlyUsedReady: true,
        recentlyUsedApps: []
      })
    ).toEqual({
      appIdToRestore: undefined,
      isRecentlyUsedExpanded: true
    });
  });
});
