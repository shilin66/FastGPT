// import type { ApiResponseType } from '@fastgpt/service/type/next';
// import { NextAPI } from '@/service/middleware/entry';
// import { updatePermission } from '@fastgpt/service/support/user/team/controller';
// import { NextApiRequest } from 'next';
// import { UpdatePermissionBody } from '@fastgpt/global/support/permission/collaborator';
// import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
// import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
//
// async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
//   const updatePermissionBody = req.body as UpdatePermissionBody;
//
//   const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });
//
//   await updatePermission(updatePermissionBody, teamId);
// }
//
// export default NextAPI(handler);
