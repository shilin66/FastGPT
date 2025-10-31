import type { SourceMemberType } from '../../../support/user/type';
import type { UsageItemTypeEnum, UsageSourceEnum } from './constants';

export type UsageSchemaType = {
  _id: string;
  time: Date;

  teamId: string;
  tmbId: string;
  appName: string;
  appId?: string;
  pluginId?: string;
  totalPoints: number;
  source: `${UsageSourceEnum}`;

  // @deprecated
  list?: UsageItemType[];
};
export type UsageItemSchemaType = {
  _id: string;
  teamId: string;
  usageId: string;
  name: string;
  amount: number;
  time: Date;
  itemType?: UsageItemTypeEnum; // Use in usage concat
} & UsageItemCountType;

export type UsageItemCountType = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  charsLength?: number;
  duration?: number;
  pages?: number;
  count?: number; // Times

  // deprecated
  tokens?: number;
};

export type UsageItemType = UsageItemCountType & {
  moduleName: string;
  amount: number;
  itemType?: UsageItemTypeEnum;
};

export type UsageListItemType = {
  id: string;
  time: Date;
  appName: string;
  source: UsageSchemaType['source'];
  totalPoints: number;
  list: Omit<UsageItemType, 'itemType'>[];
  sourceMember: SourceMemberType;
};

export type TeamUsageItemType = {
  id: string;
  teamAvatar: string;
  teamName: string;
  totalPoints: number;
  totalInputTokens: string;
  totalOutputTokens: string;
  totalTokens: string;
  owner: string;
  models: {
    name?: string;
    amount: number;
    inputTokens: string;
    outputTokens: string;
    allTokens: string;
    charsLength?: string;
    pages?: string;
    duration?: string;
  }[];
};
