import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

/* 初始化发布的版本 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });
    // 修改用户的defaultTeam 和 lastLoginTmbId
    const tmbList = await MongoTeamMember.find({
      defaultTeam: true
    }).lean();
    await Promise.all(
      tmbList.map(async (tmb) => {
        await MongoUser.updateOne(
          {
            _id: tmb.userId
          },
          {
            $set: {
              lastLoginTmbId: tmb._id
            }
          }
        );
      })
    );

    const defaultTeam = await MongoTeam.findOne({ name: feConfigs.userDefaultTeam });
    if (defaultTeam) {
      await MongoTeamMember.updateMany({
        $set: {
          defaultTeam: false
        }
      });
      await MongoTeamMember.updateMany(
        {
          teamId: defaultTeam._id
        },
        {
          $set: {
            defaultTeam: true
          }
        }
      );
    }

    // 初始化团队成员昵称
    const userList = await MongoUser.find().lean();

    await Promise.all(
      userList.map(async (user) => {
        await MongoTeamMember.updateMany(
          {
            userId: user._id
          },
          {
            $set: {
              name: user.username.replaceAll('@zenlayer.com', '')
            }
          }
        );
      })
    );

    const mongoTeams = await MongoTeam.find().lean();

    // 初始化团队成员组
    await Promise.all(
      mongoTeams.map(async (team) => {
        if (
          await MongoMemberGroupModel.exists({
            teamId: team._id,
            name: DefaultGroupName
          })
        )
          return;
        await MongoMemberGroupModel.create({
          teamId: team._id,
          name: DefaultGroupName,
          avatar: team.avatar
        });
      })
    );

    const memberGroups = await MongoMemberGroupModel.find({
      name: DefaultGroupName
    }).lean();

    const teamGroupMap = memberGroups.reduce(
      (acc, cur) => {
        acc[cur.teamId] = cur._id;
        return acc;
      },
      {} as { [key: string]: string }
    );

    // 初始化应用成员组数据
    const appList = await MongoApp.find().lean();
    await Promise.all(
      appList.map(async (app) => {
        if (!teamGroupMap[app.teamId]) {
          return;
        }
        if (app.defaultPermission === ReadPermissionVal) {
          if (
            await MongoResourcePermission.exists({
              resourceType: PerResourceTypeEnum.app,
              resourceId: app._id,
              groupId: teamGroupMap[app.teamId],
              teamId: app.teamId
            })
          )
            return;
          await MongoResourcePermission.create({
            resourceType: PerResourceTypeEnum.app,
            resourceId: app._id,
            groupId: teamGroupMap[app.teamId],
            permission: ReadPermissionVal,
            teamId: app.teamId
          });
        } else if (app.defaultPermission === WritePermissionVal) {
          if (
            await MongoResourcePermission.exists({
              resourceType: PerResourceTypeEnum.app,
              resourceId: app._id,
              groupId: teamGroupMap[app.teamId],
              teamId: app.teamId
            })
          )
            return;
          await MongoResourcePermission.create({
            resourceType: PerResourceTypeEnum.app,
            resourceId: app._id,
            groupId: teamGroupMap[app.teamId],
            permission: WritePermissionVal,
            teamId: app.teamId
          });
        }
      })
    );

    // 初始化知识库成员组数据
    const datasetList = await MongoDataset.find().lean();
    await Promise.all(
      datasetList.map(async (dataset) => {
        if (!teamGroupMap[dataset.teamId]) {
          return;
        }
        if (dataset.defaultPermission === ReadPermissionVal) {
          if (
            await MongoResourcePermission.exists({
              resourceType: PerResourceTypeEnum.dataset,
              resourceId: dataset._id,
              groupId: teamGroupMap[dataset.teamId],
              teamId: dataset.teamId
            })
          )
            return;
          await MongoResourcePermission.create({
            resourceType: PerResourceTypeEnum.dataset,
            resourceId: dataset._id,
            groupId: teamGroupMap[dataset.teamId],
            permission: ReadPermissionVal,
            teamId: dataset.teamId
          });
        } else if (dataset.defaultPermission === WritePermissionVal) {
          if (
            await MongoResourcePermission.exists({
              resourceType: PerResourceTypeEnum.dataset,
              resourceId: dataset._id,
              groupId: teamGroupMap[dataset.teamId],
              teamId: dataset.teamId
            })
          )
            return;
          await MongoResourcePermission.create({
            resourceType: PerResourceTypeEnum.dataset,
            resourceId: dataset._id,
            groupId: teamGroupMap[dataset.teamId],
            permission: WritePermissionVal,
            teamId: dataset.teamId
          });
        }
      })
    );

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
