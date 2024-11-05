import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { NextApiRequest } from 'next';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  // const updateClbPermissionProps = req.body as UpdateClbPermissionProps;
  //
  // await authUserPer({ req, authToken: true, per: ManagePermissionVal });
  //
  // await updateMemberPermission(updateClbPermissionProps);
}

export default NextAPI(handler);
