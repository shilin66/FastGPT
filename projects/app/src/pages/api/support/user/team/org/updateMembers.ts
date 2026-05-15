import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { putUpdateOrgMembersData } from '@fastgpt/global/support/user/team/org/api';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';

async function handler(req: ApiRequestProps<putUpdateOrgMembersData>, res: ApiResponseType<any>) {
  const { orgId, members } = req.body;

  const { teamId } = await authUserPer({ req, authToken: true, per: TeamManagePermissionVal });

  try {
    await mongoSessionRun(async (session) => {
      const org =
        orgId === ''
          ? await MongoOrgModel.findOne({ teamId, path: '' }, undefined, { session })
          : orgId
            ? await MongoOrgModel.findOne({ _id: orgId, teamId }, undefined, { session })
            : null;

      if (!org) {
        return Promise.reject(TeamErrEnum.orgNotExist);
      }

      const realOrgId = org._id;

      // remove old members
      await MongoOrgMemberModel.deleteMany(
        {
          orgId: realOrgId,
          teamId
        },
        { session }
      );

      for await (const member of members) {
        await MongoOrgMemberModel.create(
          [
            {
              teamId,
              orgId: realOrgId,
              tmbId: member.tmbId
            }
          ],
          { session }
        );
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update organization members' });
  }
  return {};
}

export default NextAPI(handler);
