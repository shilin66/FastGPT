import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest } from 'next';
import type { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { updatePermission } from '@fastgpt/service/support/user/team/controller';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { tmbId, orgId, groupId, permission } = req.body as {
    tmbId?: string;
    orgId?: string;
    groupId?: string;
    permission: PermissionValueType;
  };

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });
  const collaborators = [
    tmbId && { tmbId, permission },
    orgId && { orgId, permission },
    groupId && { groupId, permission }
  ].filter(Boolean) as Array<
    { permission: PermissionValueType } & (
      | { tmbId: string }
      | { orgId: string }
      | { groupId: string }
    )
  >;

  await updatePermission({ collaborators }, teamId);
}

export default NextAPI(handler);
