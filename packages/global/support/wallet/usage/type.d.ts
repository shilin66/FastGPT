import type { SourceMemberType } from '../../../support/user/type';
import type { CreateUsageProps } from './api';
import { UsageSourceEnum } from './constants';

export type UsageListItemCountType = {
  inputTokens?: number;
  outputTokens?: number;
  charsLength?: number;
  duration?: number;
  pages?: number;
  count?: number; // Times

  // deprecated
  tokens?: number;
};

export type UsageListItemType = UsageListItemCountType & {
  moduleName: string;
  amount: number;
  model?: string;
  count?: number;
};

export type UsageSchemaType = CreateUsageProps & {
  _id: string;
  time: Date;
};

export type UsageItemType = {
  id: string;
  time: Date;
  appName: string;
  source: UsageSchemaType['source'];
  totalPoints: number;
  list: UsageSchemaType['list'];
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
