import type { AdminResourceListQuery } from '@fastgpt/global/openapi/admin/manage/api';
import { isValidObjectId } from 'mongoose';
import { MongoApp } from '../../core/app/schema';
import { MongoDatasetCollection } from '../../core/dataset/collection/schema';
import { MongoDatasetData } from '../../core/dataset/data/schema';
import { MongoDataset } from '../../core/dataset/schema';
import { MongoUser } from '../../support/user/schema';
import { MongoTeam } from '../../support/user/team/teamSchema';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';

const getOwnerMaps = async (teamIds: readonly string[], tmbIds: readonly string[]) => {
  const [teams, members] = await Promise.all([
    MongoTeam.find({ _id: { $in: teamIds } }, 'name').lean(),
    MongoTeamMember.find({ _id: { $in: tmbIds } }, 'userId').lean()
  ]);
  const users = await MongoUser.find(
    { _id: { $in: members.map((member) => member.userId) } },
    'username'
  ).lean();
  return {
    teamNameMap: new Map(teams.map((team) => [String(team._id), team.name])),
    memberUserMap: new Map(members.map((member) => [String(member._id), String(member.userId)])),
    usernameMap: new Map(users.map((user) => [String(user._id), user.username]))
  };
};

export const listAdminApps = async (query: AdminResourceListQuery) => {
  const { pageNum, pageSize, searchKey, teamId, ownerId, type } = query;
  const ownerTmbIds = ownerId
    ? await MongoTeamMember.find({ userId: ownerId }, '_id').distinct('_id')
    : undefined;
  const filter = {
    deleteTime: null,
    ...(searchKey
      ? {
          $or: [
            { name: { $regex: searchKey, $options: 'i' } },
            ...(isValidObjectId(searchKey) ? [{ _id: searchKey }] : [])
          ]
        }
      : {}),
    ...(teamId ? { teamId } : {}),
    ...(ownerTmbIds ? { tmbId: { $in: ownerTmbIds } } : {}),
    ...(type ? { type } : {})
  };
  const [total, apps] = await Promise.all([
    MongoApp.countDocuments(filter),
    MongoApp.find(filter, 'name intro type teamId tmbId updateTime')
      .sort({ updateTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);
  const maps = await getOwnerMaps(
    apps.map((app) => String(app.teamId)),
    apps.map((app) => String(app.tmbId))
  );
  return {
    total,
    list: apps.map((app) => {
      const ownerUserId = maps.memberUserMap.get(String(app.tmbId)) ?? '';
      return {
        id: String(app._id),
        name: app.name,
        intro: app.intro ?? '',
        type: app.type,
        teamId: String(app.teamId),
        teamName: maps.teamNameMap.get(String(app.teamId)) ?? '已删除团队',
        ownerId: ownerUserId,
        ownerName: maps.usernameMap.get(ownerUserId) ?? '已删除用户',
        updateTime: app.updateTime
      };
    })
  };
};

export const getAdminAppDetail = async (appId: string) => {
  const app = await MongoApp.findOne({ _id: appId, deleteTime: null })
    .select('name intro type teamId tmbId updateTime version parentId inheritPermission')
    .lean();
  if (!app) throw new Error('应用不存在');
  const maps = await getOwnerMaps([String(app.teamId)], [String(app.tmbId)]);
  const ownerUserId = maps.memberUserMap.get(String(app.tmbId)) ?? '';
  return {
    id: String(app._id),
    name: app.name,
    intro: app.intro ?? '',
    type: app.type,
    version: app.version,
    parentId: app.parentId ? String(app.parentId) : undefined,
    inheritPermission: app.inheritPermission,
    teamId: String(app.teamId),
    teamName: maps.teamNameMap.get(String(app.teamId)) ?? '已删除团队',
    ownerId: ownerUserId,
    ownerName: maps.usernameMap.get(ownerUserId) ?? '已删除用户',
    updateTime: app.updateTime
  };
};

export const listAdminDatasets = async (query: AdminResourceListQuery) => {
  const { pageNum, pageSize, searchKey, teamId, ownerId, type } = query;
  const ownerTmbIds = ownerId
    ? await MongoTeamMember.find({ userId: ownerId }, '_id').distinct('_id')
    : undefined;
  const filter = {
    deleteTime: null,
    ...(searchKey
      ? {
          $or: [
            { name: { $regex: searchKey, $options: 'i' } },
            ...(isValidObjectId(searchKey) ? [{ _id: searchKey }] : [])
          ]
        }
      : {}),
    ...(teamId ? { teamId } : {}),
    ...(ownerTmbIds ? { tmbId: { $in: ownerTmbIds } } : {}),
    ...(type ? { type } : {})
  };
  const [total, datasets] = await Promise.all([
    MongoDataset.countDocuments(filter),
    MongoDataset.find(filter, 'name intro type teamId tmbId updateTime')
      .sort({ updateTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);
  const maps = await getOwnerMaps(
    datasets.map((dataset) => String(dataset.teamId)),
    datasets.map((dataset) => String(dataset.tmbId))
  );
  const list = await Promise.all(
    datasets.map(async (dataset) => {
      const ownerUserId = maps.memberUserMap.get(String(dataset.tmbId)) ?? '';
      const [collectionCount, dataCount, indexStats] = await Promise.all([
        MongoDatasetCollection.countDocuments({ datasetId: dataset._id }),
        MongoDatasetData.countDocuments({ datasetId: dataset._id }),
        MongoDatasetData.aggregate<{ total: number }>([
          { $match: { datasetId: dataset._id } },
          {
            $group: {
              _id: null,
              total: { $sum: { $size: { $ifNull: ['$indexes', []] } } }
            }
          }
        ])
      ]);
      return {
        id: String(dataset._id),
        name: dataset.name,
        intro: dataset.intro ?? '',
        type: dataset.type,
        teamId: String(dataset.teamId),
        teamName: maps.teamNameMap.get(String(dataset.teamId)) ?? '已删除团队',
        ownerId: ownerUserId,
        ownerName: maps.usernameMap.get(ownerUserId) ?? '已删除用户',
        updateTime: dataset.updateTime,
        collectionCount,
        dataCount,
        indexSize: indexStats[0]?.total ?? 0
      };
    })
  );
  return { total, list };
};

export const getAdminDatasetDetail = async (datasetId: string) => {
  const dataset = await MongoDataset.findOne({ _id: datasetId, deleteTime: null })
    .select(
      'name intro type teamId tmbId updateTime vectorModel agentModel parentId inheritPermission status'
    )
    .lean();
  if (!dataset) throw new Error('知识库不存在');
  const [maps, collectionCount, dataCount] = await Promise.all([
    getOwnerMaps([String(dataset.teamId)], [String(dataset.tmbId)]),
    MongoDatasetCollection.countDocuments({ datasetId }),
    MongoDatasetData.countDocuments({ datasetId })
  ]);
  const ownerUserId = maps.memberUserMap.get(String(dataset.tmbId)) ?? '';
  return {
    id: String(dataset._id),
    name: dataset.name,
    intro: dataset.intro ?? '',
    type: dataset.type,
    // status: dataset.status,
    vectorModel: dataset.vectorModel,
    agentModel: dataset.agentModel,
    parentId: dataset.parentId ? String(dataset.parentId) : undefined,
    inheritPermission: dataset.inheritPermission,
    teamId: String(dataset.teamId),
    teamName: maps.teamNameMap.get(String(dataset.teamId)) ?? '已删除团队',
    ownerId: ownerUserId,
    ownerName: maps.usernameMap.get(ownerUserId) ?? '已删除用户',
    updateTime: dataset.updateTime,
    collectionCount,
    dataCount
  };
};
