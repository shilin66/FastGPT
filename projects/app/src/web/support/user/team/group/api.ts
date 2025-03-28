import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';
import type {
  postCreateGroupData,
  putUpdateGroupData
} from '@fastgpt/global/support/user/team/group/api';

export const getGroupList = () => GET<MemberGroupListType>('/support/user/team/group/list');

export const postCreateGroup = (data: postCreateGroupData) =>
  POST('/support/user/team/group/create', data);

export const deleteGroup = (groupId: string) =>
  DELETE('/support/user/team/group/delete', { groupId });

export const putUpdateGroup = (data: putUpdateGroupData) =>
  PUT('/support/user/team/group/update', data);
