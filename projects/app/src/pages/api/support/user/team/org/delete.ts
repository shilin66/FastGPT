import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { NextApiRequest } from 'next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getOrgAndChildren } from '@fastgpt/service/support/permission/org/controllers';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';

async function handler(req: NextApiRequest, res: ApiResponseType<any>) {
  const { orgId } = req.query as { orgId: string };

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await mongoSessionRun(async (session) => {
    const { org, children } = await getOrgAndChildren({ orgId, teamId, session });
    const orgIds = children.map((item) => item._id);
    orgIds.push(org._id);

    await MongoResourcePermission.deleteMany(
      {
        teamId,
        orgId: {
          $in: orgIds
        }
      },
      { session }
    );

    await MongoOrgMemberModel.deleteMany(
      {
        teamId,
        orgId: {
          $in: orgIds
        }
      },
      { session }
    );

    await MongoOrgModel.deleteMany(
      {
        _id: {
          $in: orgIds
        }
      },
      { session }
    );
  });

  return {};
}

export default NextAPI(handler);
