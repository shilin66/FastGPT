import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getScheduleTriggerApp } from '@/service/core/app/utils';
import type { DispatchFlowResponse } from '@fastgpt/service/core/workflow/dispatch/type';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn<(typeof import('@fastgpt/service/core/workflow/dispatch'))['dispatchWorkFlow']>(),
  version:
    vi.fn<(typeof import('@fastgpt/service/core/app/version/controller'))['getAppLatestVersion']>(),
  usage:
    vi.fn<
      (typeof import('@fastgpt/service/support/wallet/usage/controller'))['createChatUsageRecord']
    >(),
  save: vi.fn<(typeof import('@fastgpt/service/core/chat/saveChat'))['pushChatRecords']>(),
  user: vi.fn<
    (typeof import('@fastgpt/service/support/user/team/utils'))['getRunningUserInfoByTmbId']
  >()
}));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({ dispatchWorkFlow: mocks.dispatch }));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.version
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsageRecord: mocks.usage
}));
vi.mock('@fastgpt/service/core/chat/saveChat', () => ({ pushChatRecords: mocks.save }));
vi.mock('@fastgpt/service/support/user/team/utils', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/support/user/team/utils')>()),
  getRunningUserInfoByTmbId: mocks.user
}));

describe('scheduled App execution is never blindly replayed after dispatch', () => {
  const response: DispatchFlowResponse = {
    flowResponses: [],
    flowUsages: [],
    assistantResponses: [],
    runTimes: 1,
    toolResponses: [],
    newVariables: {},
    durationSeconds: 1,
    debugResponse: { memoryEdges: [], memoryNodes: [], entryNodeIds: [], nodeResponses: {} }
  };
  beforeEach(() => {
    mocks.dispatch.mockReset().mockResolvedValue(response);
    mocks.version.mockReset().mockResolvedValue({
      versionId: new Types.ObjectId().toHexString(),
      versionName: 'QA published version',
      nodes: [],
      edges: [],
      chatConfig: {}
    });
    mocks.usage.mockReset().mockResolvedValue(new Types.ObjectId().toHexString());
    mocks.save.mockReset().mockResolvedValue(undefined);
    mocks.user.mockReset().mockImplementation(async (tmbId) => ({
      tmbId,
      teamId: 'qa-team',
      username: 'QA',
      teamName: 'QA',
      memberName: 'QA',
      contact: ''
    }));
  });
  const seed = () =>
    MongoApp.create({
      teamId: new Types.ObjectId(),
      tmbId: new Types.ObjectId(),
      name: 'isolated scheduled Skill QA',
      scheduledTriggerConfig: {
        cronString: '0 * * * *',
        timezone: 'Asia/Shanghai',
        defaultPrompt: 'QA only'
      },
      scheduledTriggerNextTime: new Date(Date.now() - 60000)
    });

  it('does not rerun a workflow after an external side effect followed by an exception', async () => {
    const app = await seed();
    let sideEffects = 0;
    mocks.dispatch.mockImplementation(async () => {
      sideEffects++;
      throw new Error('QA response lost after tool completed');
    });
    await getScheduleTriggerApp();
    expect(sideEffects).toBe(1);
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      appId: String(app._id),
      source: ChatSourceEnum.cronJob,
      errorMsg: 'QA response lost after tool completed'
    });
    expect(
      (await MongoApp.findById(app._id).orFail()).scheduledTriggerNextTime!.getTime()
    ).toBeGreaterThan(Date.now());
    await getScheduleTriggerApp();
    expect(sideEffects).toBe(1);
  });

  it('retains safe pre-dispatch read retries without replaying execution', async () => {
    await seed();
    mocks.version.mockRejectedValueOnce(new Error('temporary version read failure'));
    await getScheduleTriggerApp();
    expect(mocks.version).toHaveBeenCalledTimes(2);
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it('preserves the owner runtime identity, published version and cron chat source', async () => {
    const app = await seed();
    await getScheduleTriggerApp();
    const call = mocks.dispatch.mock.calls[0][0];
    expect(call).toMatchObject({
      uid: String(app.tmbId),
      runningAppInfo: {
        id: String(app._id),
        teamId: String(app.teamId),
        tmbId: String(app.tmbId)
      },
      stream: false,
      histories: []
    });
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      chatId: call.chatId,
      source: ChatSourceEnum.cronJob,
      versionId: (await mocks.version.mock.results[0].value).versionId
    });
  });

  it('retries a transient owner lookup before the single dispatch', async () => {
    await seed();
    mocks.user.mockRejectedValueOnce(new Error('QA transient member lookup'));
    await getScheduleTriggerApp();
    expect(mocks.user).toHaveBeenCalledTimes(2);
    expect(mocks.dispatch).toHaveBeenCalledOnce();
  });

  it('does not rerun a completed workflow if chat persistence fails', async () => {
    await seed();
    mocks.save.mockRejectedValueOnce(new Error('QA chat persistence failure'));
    await getScheduleTriggerApp();
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });
});
