import { vi } from 'vitest';
import type { ToolDispatchContext } from '../../../../../../../core/workflow/dispatch/ai/agent/piAgent/toolAdapter';

export const createSandboxTestContext = (): ToolDispatchContext => ({
  checkIsStopping: () => false,
  chatConfig: {},
  externalProvider: {},
  runningAppInfo: { id: 'app', teamId: 'team', tmbId: 'owner', name: 'App' },
  runningUserInfo: {
    teamId: 'team',
    tmbId: 'member',
    username: 'user',
    teamName: 'Team',
    memberName: 'Member',
    contact: ''
  },
  chatId: 'chat',
  uid: 'visitor',
  variables: {},
  mode: 'chat',
  timezone: 'UTC',
  maxRunTimes: 20,
  workflowDispatchDeep: 1,
  usagePush: vi.fn(),
  model: 'test'
});
