import type {
  AdminCreateUserSchema,
  AdminUpdateUserSchema,
  AdminUserListQuery
} from '@fastgpt/global/openapi/admin/manage/api';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import type { z } from 'zod';
import { MongoApp } from '../../core/app/schema';
import { MongoDataset } from '../../core/dataset/schema';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoUser } from '../../support/user/schema';
import { delUserAllSession } from '../../support/user/session';
import { createDefaultTeam } from '../../support/user/team/controller';
import { MongoTeam } from '../../support/user/team/teamSchema';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';

type CreateUserInput = z.infer<typeof AdminCreateUserSchema>;
type UpdateUserInput = z.infer<typeof AdminUpdateUserSchema>;

const createSearchFilter = (searchKey?: string) => {
  if (!searchKey) return {};
  return {
    $or: [
      { username: { $regex: searchKey, $options: 'i' } },
      { contact: { $regex: searchKey, $options: 'i' } }
    ]
  };
};

export const listAdminUsers = async (query: AdminUserListQuery) => {
  const { pageNum, pageSize, searchKey, status, teamId } = query;
  const memberUserIds = teamId
    ? await MongoTeamMember.find({ teamId }, 'userId').distinct('userId')
    : undefined;
  const filter = {
    ...createSearchFilter(searchKey),
    ...(status ? { status } : {}),
    ...(memberUserIds ? { _id: { $in: memberUserIds } } : {})
  };
  const [total, users] = await Promise.all([
    MongoUser.countDocuments(filter),
    MongoUser.find(filter)
      .select('username contact loginType status createTime')
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);

  const list = await Promise.all(
    users.map(async (user) => {
      const memberships = await MongoTeamMember.find({ userId: user._id }, '_id').lean();
      const tmbIds = memberships.map((item) => item._id);
      const [appCount, datasetCount] = await Promise.all([
        MongoApp.countDocuments({ tmbId: { $in: tmbIds }, deleteTime: null }),
        MongoDataset.countDocuments({ tmbId: { $in: tmbIds }, deleteTime: null })
      ]);
      return {
        id: String(user._id),
        username: user.username,
        contact: user.contact,
        loginType: user.loginType,
        status: user.status,
        createTime: user.createTime,
        teamCount: memberships.length,
        appCount,
        datasetCount,
        isRoot: user.username === 'root'
      };
    })
  );

  return { total, list };
};

export const getAdminUserDetail = async (userId: string) => {
  const user = await MongoUser.findById(userId)
    .select('username contact loginType status createTime timezone language')
    .lean();
  if (!user) throw new Error('用户不存在');

  const members = await MongoTeamMember.find({ userId }).lean();
  const teamIds = members.map((member) => member.teamId);
  const teams = await MongoTeam.find({ _id: { $in: teamIds } }, 'name ownerId').lean();
  const teamMap = new Map(teams.map((team) => [String(team._id), team]));
  const tmbIds = members.map((member) => member._id);
  const [appCount, datasetCount] = await Promise.all([
    MongoApp.countDocuments({ tmbId: { $in: tmbIds }, deleteTime: null }),
    MongoDataset.countDocuments({ tmbId: { $in: tmbIds }, deleteTime: null })
  ]);

  return {
    id: String(user._id),
    username: user.username,
    contact: user.contact,
    loginType: user.loginType,
    status: user.status,
    createTime: user.createTime,
    timezone: user.timezone,
    language: user.language,
    teamCount: members.length,
    appCount,
    datasetCount,
    isRoot: user.username === 'root',
    teams: members.map((member) => {
      const team = teamMap.get(String(member.teamId));
      return {
        teamId: String(member.teamId),
        teamName: team?.name ?? '已删除团队',
        tmbId: String(member._id),
        memberName: member.name,
        status: member.status,
        isOwner: String(team?.ownerId ?? '') === String(user._id)
      };
    })
  };
};

export const createAdminUser = async (input: CreateUserInput) => {
  if (input.username === 'root' || input.username === 'admin') {
    throw new Error('用户名不可用');
  }
  if (await MongoUser.exists({ username: input.username })) throw new Error('用户名已存在');

  return mongoSessionRun(async (session) => {
    const [user] = await MongoUser.create(
      [
        {
          username: input.username,
          password: input.password,
          loginType: 'password',
          contact: input.contact,
          timezone: input.timezone,
          language: input.language,
          status: UserStatusEnum.active,
          passwordUpdateTime: new Date()
        }
      ],
      { session }
    );
    const member = await createDefaultTeam({
      userId: String(user._id),
      teamName: `${input.username} Team`,
      session
    });
    if (member) {
      member.name = input.username;
      await member.save({ session });
      user.lastLoginTmbId = member._id;
      await user.save({ session });
    }
    return { id: String(user._id) };
  });
};

export const updateAdminUser = async (input: UpdateUserInput) => {
  const user = await MongoUser.findById(input.id);
  if (!user) throw new Error('用户不存在');
  if (user.username === 'root') throw new Error('不能修改 root 用户');
  user.contact = input.contact;
  if (input.timezone) user.timezone = input.timezone;
  if (input.language) user.language = input.language;
  await user.save();
  return { id: String(user._id) };
};

const getMutableUser = async (userId: string) => {
  const user = await MongoUser.findById(userId);
  if (!user) throw new Error('用户不存在');
  if (user.username === 'root') throw new Error('不能操作 root 用户');
  return user;
};

export const freezeAdminUser = async (userId: string) => {
  const user = await getMutableUser(userId);
  user.status = UserStatusEnum.forbidden;
  await user.save();
  await delUserAllSession(userId);
  return { id: userId };
};

export const unfreezeAdminUser = async (userId: string) => {
  const user = await getMutableUser(userId);
  user.status = UserStatusEnum.active;
  await user.save();
  return { id: userId };
};

export const resetAdminUserPassword = async (userId: string, password: string) => {
  const user = await getMutableUser(userId);
  user.password = password;
  user.passwordUpdateTime = new Date();
  await user.save();
  await delUserAllSession(userId);
  return { id: userId };
};
