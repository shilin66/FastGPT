// import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
// import { NextAPI } from '@/service/middleware/entry';
// import { UpdateStatusProps } from '@fastgpt/global/support/user/team/controller';
// import { updateInviteResult } from '@fastgpt/service/support/user/team/controller';
// import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
// import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
//
// async function handler(req: ApiRequestProps<UpdateStatusProps>, res: ApiResponseType<any>) {
//   const body = req.body;
//
//   await authUserPer({ req, authToken: true, per: ManagePermissionVal });
//
//   await updateInviteResult(body);
// }
//
// export default NextAPI(handler);
