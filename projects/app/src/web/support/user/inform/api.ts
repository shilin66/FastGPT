import { GET, POST } from '@/web/common/api/request';
import type { UserInformType } from '@fastgpt/global/support/user/inform/type';
import type { SystemMsgModalValueType } from '@fastgpt/service/support/user/inform/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getInforms = (data: PaginationProps) =>
  POST<PaginationResponse<UserInformType>>(`/proApi/support/user/inform/list`, data);

export const getUnreadCount = () =>
  GET<{
    unReadCount: number;
    importantInforms: UserInformType[];
  }>(`/proApi/support/user/inform/countUnread`);
export const readInform = (id: string) => GET(`/proApi/support/user/inform/read`, { id });

export const getSystemMsgModalData = () =>
  GET<SystemMsgModalValueType>(`/support/user/inform/getSystemMsgModal`);

export const updateSystemMsgModalData = (updateMsg: SystemMsgModalValueType) =>
  POST<SystemMsgModalValueType>(`/support/user/inform/updateSystemMsg`, updateMsg);
