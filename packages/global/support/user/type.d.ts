import type { TeamPermission } from '../permission/user/controller';
import type { UserStatusEnum } from './constant';
import type { TeamMemberStatusEnum } from './team/constant';
import type { TeamTmbItemType } from './team/type';

export type UserModelSchema = {
  _id: string;
  username: string;
  loginType: string;
  password: string;
  promotionRate: number;
  inviterId?: string;
  openaiKey: string;
  createTime: number;
  timezone: string;
  status: `${UserStatusEnum}`;
  lastLoginTmbId?: string;
  confluenceAccount?: {
    apiToken: string;
    account: string;
  };
  passwordUpdateTime?: Date;
  fastgpt_sem?: {
    keyword: string;
  };
  contact?: string;
};

export type UserType = {
  _id: string;
  username: string;
  avatar: string; // it should be team member's avatar after 4.8.18
  timezone: string;
  loginType: string;
  promotionRate: UserModelSchema['promotionRate'];
  confluenceAccount: UserModelSchema['confluenceAccount'];
  team: TeamTmbItemType;
  notificationAccount?: string;
  permission: TeamPermission;
  contact?: string;
};

export type SourceMemberType = {
  name: string;
  avatar: string;
  status: `${TeamMemberStatusEnum}`;
};
