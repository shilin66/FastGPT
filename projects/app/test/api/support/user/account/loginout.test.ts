import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as loginoutApi from '@/pages/api/support/user/account/loginout';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import { Call } from '@test/utils/request';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';

const mocks = vi.hoisted(() => ({ revoke: vi.fn() }));
vi.mock('@/service/core/sandbox/proxyTicket', () => ({
  revokeSandboxProxyUser: mocks.revoke
}));

describe('loginout API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    testUser = await MongoUser.create({
      username: 'testuser',
      password: 'testpassword',
      status: UserStatusEnum.active
    });
    testTeam = await MongoTeam.create({
      name: 'Test Team',
      ownerId: testUser._id
    });
    await initTeamFreePlan({ teamId: String(testTeam._id) });
    testTmb = await MongoTeamMember.create({
      teamId: testTeam._id,
      userId: testUser._id,
      status: 'active',
      role: 'owner'
    });
    vi.clearAllMocks();
    mocks.revoke.mockResolvedValue(undefined);
  });

  it('should logout successfully with valid auth', async () => {
    const res = await Call(loginoutApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith(String(testUser._id));
  });

  it('should succeed even when unauthenticated (auth errors are caught)', async () => {
    // loginout catches auth errors and always calls clearCookie
    const res = await Call(loginoutApi.default, {});

    expect(res.code).toBe(200);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it('does not acknowledge logout when atomic session revocation fails', async () => {
    const failure = new Error('Redis unavailable');
    mocks.revoke.mockRejectedValueOnce(failure);
    const res = await Call(loginoutApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123',
        appId: '',
        authType: AuthUserTypeEnum.token,
        sourceName: undefined,
        apikey: ''
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(failure);
    expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith(String(testUser._id));
  });
});
