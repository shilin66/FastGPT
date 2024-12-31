import { TeamPermission } from '../permission/user/controller';
import { UserStatusEnum } from './constant';
import { TeamTmbItemType } from './team/type';

export type UserModelSchema = {
  _id: string;
  username: string;
  loginType: string;
  password: string;
  avatar: string;
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
  fastgpt_sem?: {
    keyword: string;
  };
};

export type UserType = {
  _id: string;
  username: string;
  avatar: string;
  timezone: string;
  loginType: string;
  promotionRate: UserModelSchema['promotionRate'];
  confluenceAccount: UserModelSchema['confluenceAccount'];
  team: TeamTmbItemType;
  standardInfo?: standardInfoType;
  notificationAccount?: string;
  permission: TeamPermission;
};
