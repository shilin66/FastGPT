import { POST } from '@/web/common/api/request';
import type {
  CreateTrainingUsageProps,
  GetTeamUsageProps,
  GetUsageDashboardProps,
  GetUsageDashboardResponseItem,
  GetUsageProps
} from '@fastgpt/global/support/wallet/usage/api.d';
import type { TeamUsageItemType, UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getUserUsages = (data: PaginationProps<GetUsageProps>) =>
  POST<PaginationResponse<UsageItemType>>(`/support/wallet/usage/getUsage`, data);

export const getDashboardData = (data: GetUsageDashboardProps) =>
  POST<GetUsageDashboardResponseItem[]>(`/support/wallet/usage/getDashboardData`, data);

export const postCreateTrainingUsage = (data: CreateTrainingUsageProps) =>
  POST<string>(`/support/wallet/usage/createTrainingUsage`, data);

export const getTeamUsage = (data: PaginationProps<GetTeamUsageProps>) =>
  POST<PaginationResponse<TeamUsageItemType>>(`/support/wallet/usage/getTeamUsage`, data);

export const usageStats = (data: { dateStart: string; dateEnd: string }) =>
  POST<any>(`/support/wallet/usage/stats`, data);
