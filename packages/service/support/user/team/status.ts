import { MongoTeam } from './teamSchema';
import { getGlobalRedisConnection } from '../../../common/redis';
import {
  ManagePermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';

const getTeamStatusKey = (teamId: string) => `team_status:${teamId}`;

export const setTeamStatusCache = async (teamId: string, status: 'active' | 'frozen') => {
  await getGlobalRedisConnection().set(getTeamStatusKey(teamId), status, 'EX', 30);
};

export const assertTeamActive = async (teamId: string) => {
  if (!teamId) return;

  const redis = getGlobalRedisConnection();
  const cached = await redis.get(getTeamStatusKey(teamId));
  if (cached === 'frozen') throw new Error('团队已冻结');
  if (cached === 'active') return;

  const status = (await MongoTeam.exists({ _id: teamId, status: 'frozen' })) ? 'frozen' : 'active';
  await setTeamStatusCache(teamId, status);
  if (status === 'frozen') throw new Error('团队已冻结');
};

export const assertTeamWritable = async (teamId: string, permission: number) => {
  if ((permission & (WritePermissionVal | ManagePermissionVal)) !== 0) {
    await assertTeamActive(teamId);
  }
};
