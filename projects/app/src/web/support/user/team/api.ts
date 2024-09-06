import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';
import {
  CreateTeamProps,
  InviteMemberProps,
  InviteMemberResponse,
  UpdateInviteProps,
  UpdateTeamProps
} from '@fastgpt/global/support/user/team/controller.d';
import type { TeamTagItemType, TeamTagSchema } from '@fastgpt/global/support/user/team/type';
import {
  TeamTmbItemType,
  TeamMemberItemType,
  TeamMemberSchema
} from '@fastgpt/global/support/user/team/type.d';
import { FeTeamPlanStatusType, TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';
import { TeamInvoiceHeaderType } from '@fastgpt/global/support/user/team/type';

/* --------------- team  ---------------- */
export const getTeamList = (status: `${TeamMemberSchema['status']}`) =>
  GET<TeamTmbItemType[]>(`/support/user/team/list`, { status });
export const postCreateTeam = (data: CreateTeamProps) =>
  POST<string>(`/support/user/team/create`, data);
export const putUpdateTeam = (data: UpdateTeamProps) => PUT(`/support/user/team/update`, data);
export const putSwitchTeam = (teamId: string) =>
  PUT<string>(`/support/user/team/switch`, { teamId });

/* --------------- team member ---------------- */
export const getTeamMembers = () => GET<TeamMemberItemType[]>(`/support/user/team/member/list`);
export const postInviteTeamMember = (data: InviteMemberProps) =>
  POST<InviteMemberResponse>(`/support/user/team/member/invite`, data);
export const putUpdateMemberName = (name: string) =>
  PUT(`/support/user/team/member/updateName`, { name });
export const delRemoveMember = (tmbId: string) =>
  DELETE(`/support/user/team/member/delete`, { tmbId });
export const updateInviteResult = (data: UpdateInviteProps) =>
  PUT('/support/user/team/member/updateInvite', data);
export const delLeaveTeam = (teamId: string) =>
  DELETE('/support/user/team/member/leave', { teamId });

/* -------------- team collaborator -------------------- */
export const updateMemberPermission = (data: UpdateClbPermissionProps) =>
  PUT('/support/user/team/collaborator/update', data);
export const delMemberPermission = (tmbId: string) =>
  DELETE('/support/user/team/collaborator/delete', { tmbId });

/* --------------- team tags ---------------- */
export const getTeamsTags = () => GET<TeamTagSchema[]>(`/support/user/team/tag/list`);
export const loadTeamTagsByDomain = (domain: string) =>
  GET<TeamTagItemType[]>(`/support/user/team/tag/async`, { domain });

/* team limit */
export const checkTeamExportDatasetLimit = (datasetId: string) =>
  GET(`/support/user/team/limit/exportDatasetLimit`, { datasetId });
export const checkTeamWebSyncLimit = () => GET(`/support/user/team/limit/webSyncLimit`);
export const checkTeamDatasetSizeLimit = (size: number) =>
  GET(`/support/user/team/limit/datasetSizeLimit`, { size });

/* plans */
export const getTeamPlanStatus = () =>
  GET<FeTeamPlanStatusType>(`/support/user/team/plan/getTeamPlanStatus`, { maxQuantity: 1 });
export const getTeamPlans = () => GET<TeamSubSchema[]>(`/support/user/team/plan/getTeamPlans`);

export const getTeamInvoiceHeader = () =>
  GET<TeamInvoiceHeaderType>(`/proApi/support/user/team/invoiceAccount/getTeamInvoiceHeader`);

export const updateTeamInvoiceHeader = (data: TeamInvoiceHeaderType) =>
  POST(`/proApi/support/user/team/invoiceAccount/update`, data);
