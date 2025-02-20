import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { NextApiRequest } from 'next';
import { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { updatePermission } from '@fastgpt/service/support/user/team/controller';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const updateClbPermissionProps = req.body as UpdateClbPermissionProps;

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await updatePermission(updateClbPermissionProps, teamId);
}

export default NextAPI(handler);
