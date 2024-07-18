import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { updateMemberPermission } from '@fastgpt/service/support/user/team/controller';
import { NextApiRequest } from 'next';
import { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const updateClbPermissionProps = req.body as UpdateClbPermissionProps;

  await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await updateMemberPermission(updateClbPermissionProps);
}

export default NextAPI(handler);
