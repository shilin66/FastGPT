import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { type ClientSession, Types } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  GetTeamUsageProps,
  GetUsageDashboardProps,
  GetUsageDashboardResponseItem,
  GetUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import {
  type ConcatUsageProps,
  type CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { i18nT } from '../../../../web/i18n/utils';
import { formatModelChars2Points } from './utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { PaginationResponse } from '../../../../web/common/fetch/type';
import type {
  TeamUsageItemType,
  UsageItemType,
  UsageSchemaType
} from '@fastgpt/global/support/wallet/usage/type';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { get } from 'lodash';
import { MongoTeam } from '../../user/team/teamSchema';
import type { TeamSchema } from '@fastgpt/global/support/user/team/type';
import { MongoUser } from '../../user/schema';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';

export async function createUsage(data: CreateUsageProps) {
  try {
    await MongoUsage.create([
      {
        teamId: data.teamId,
        tmbId: data.tmbId,
        appName: data.appName,
        appId: data.appId,
        pluginId: data.pluginId,
        totalPoints: data.totalPoints,
        source: data.source,
        list: data.list
      }
    ]);
  } catch (error) {
    addLog.error('createUsage error', error);
  }
}

export async function concatUsage(data: ConcatUsageProps) {
  const {
    billId,
    teamId,
    tmbId,
    inputTokens = 0,
    outputTokens = 0,
    totalPoints = 0,
    listIndex = -1
  } = data;

  // listIndex 非法时直接返回
  if (listIndex < 0) {
    console.warn('concatUsage: 无效的 listIndex', listIndex);
    return;
  }

  // 构造要更新的字段路径
  const baseKey = `list.${listIndex}`;
  const incOps: Record<string, number> = {
    totalPoints,
    // MongoDB 自动在不存在时初始化为 0 并累加
    [`${baseKey}.inputTokens`]: inputTokens,
    [`${baseKey}.outputTokens`]: outputTokens
  };

  try {
    const updated = await MongoUsage.findOneAndUpdate(
      { _id: billId, teamId, tmbId, [baseKey]: { $exists: true } },
      { $inc: incOps },
      { new: true, lean: true } // lean:true 返回普通 JS 对象，少些 Mongoose 开销
    ).exec();

    if (!updated) {
      console.warn('concatUsage: 未找到匹配文档或 listIndex 越界', {
        billId,
        teamId,
        tmbId,
        listIndex
      });
      return;
    }

    console.log('concatUsage: 更新成功', {
      totalPoints: updated.totalPoints,
      modelUsage: updated.list[listIndex]
    });
  } catch (error) {
    addLog.error('concatUsage error', error);
  }
}

export const createChatUsage = ({
  appName,
  appId,
  pluginId,
  teamId,
  tmbId,
  source,
  flowUsages
}: {
  appName: string;
  appId?: string;
  pluginId?: string;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
  flowUsages: ChatNodeUsageType[];
}) => {
  const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  createUsage({
    teamId,
    tmbId,
    appName,
    appId,
    pluginId,
    totalPoints,
    source,
    list: flowUsages.map((item) => ({
      moduleName: item.moduleName,
      amount: item.totalPoints || 0,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens
    }))
  });
  addLog.debug(`Create chat usage`, {
    source,
    teamId,
    totalPoints
  });
  return { totalPoints };
};

export type DatasetTrainingMode = 'paragraph' | 'qa' | 'autoIndex' | 'imageIndex' | 'imageParse';
export const datasetTrainingUsageIndexMap: Record<DatasetTrainingMode, number> = {
  paragraph: 1,
  qa: 2,
  autoIndex: 3,
  imageIndex: 4,
  imageParse: 5
};
export const createTrainingUsage = async ({
  teamId,
  tmbId,
  appName,
  billSource,
  vectorModel,
  agentModel,
  vllmModel,
  session
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  billSource: UsageSourceEnum;
  vectorModel?: string;
  agentModel?: string;
  vllmModel?: string;
  session?: ClientSession;
}) => {
  const [{ _id }] = await MongoUsage.create(
    [
      {
        teamId,
        tmbId,
        appName,
        source: billSource,
        totalPoints: 0,
        list: [
          ...(vectorModel
            ? [
                {
                  moduleName: i18nT('account_usage:embedding_index'),
                  model: vectorModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                }
              ]
            : []),
          ...(agentModel
            ? [
                {
                  moduleName: i18nT('account_usage:llm_paragraph'),
                  model: agentModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                },
                {
                  moduleName: i18nT('account_usage:qa'),
                  model: agentModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                },
                {
                  moduleName: i18nT('account_usage:auto_index'),
                  model: agentModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                }
              ]
            : []),
          ...(vllmModel
            ? [
                {
                  moduleName: i18nT('account_usage:image_index'),
                  model: vllmModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                },
                {
                  moduleName: i18nT('account_usage:image_parse'),
                  model: vllmModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                }
              ]
            : [])
        ]
      }
    ],
    { session, ordered: true }
  );

  return { billId: String(_id) };
};

export const createPdfParseUsage = async ({
  teamId,
  tmbId,
  pages
}: {
  teamId: string;
  tmbId: string;
  pages: number;
}) => {
  const unitPrice = global.systemEnv?.customPdfParse?.price || 0;
  const totalPoints = pages * unitPrice;

  createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_usage:pdf_enhanced_parse'),
    totalPoints,
    source: UsageSourceEnum.pdfParse,
    list: [
      {
        moduleName: i18nT('account_usage:pdf_enhanced_parse'),
        amount: totalPoints,
        model: 'Pdf Parse',
        pages
      }
    ]
  });
};

export const pushLLMTrainingUsage = async ({
  teamId,
  tmbId,
  model,
  inputTokens,
  outputTokens,
  billId,
  mode
}: {
  teamId: string;
  tmbId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  billId: string;
  mode: DatasetTrainingMode;
}) => {
  const index = datasetTrainingUsageIndexMap[mode];

  // Compute points
  const { totalPoints } = formatModelChars2Points({
    model,
    modelType: ModelTypeEnum.llm,
    inputTokens,
    outputTokens
  });

  concatUsage({
    billId,
    teamId,
    tmbId,
    totalPoints,
    inputTokens,
    outputTokens,
    listIndex: index
  });

  return { totalPoints };
};

export const usageStats = async ({
  dateStart,
  dateEnd
}: {
  dateStart?: string;
  dateEnd?: string;
}): Promise<any> => {
  try {
    // 构建基础查询条件
    const query: any = {};

    // 时间范围过滤
    if (dateStart && dateEnd) {
      query.time = {
        $gte: new Date(dateStart),
        $lte: new Date(dateEnd)
      };
    }

    // 执行聚合查询
    const result = await MongoUsage.aggregate([
      { $match: query },
      {
        $group: {
          _id: null, // 不分组
          totalPointsSum: { $sum: '$totalPoints' }
        }
      }
    ]);

    // 返回总和（如果结果为空返回0）
    return {
      platformTotalPoint: result[0]?.totalPointsSum || 0
    };
  } catch (error) {
    addLog.error('获取总点数异常:', error);
    throw new Error(`获取总点数失败: ${get(error, 'message', '未知错误')}`);
  }
};

export const getTeamUsage = async (
  { dateStart, dateEnd, teamIds, searchKey }: GetTeamUsageProps,
  offset: number,
  pageSize: number
): Promise<PaginationResponse<TeamUsageItemType>> => {
  // 构建团队查询条件
  const teamMatch: any = {};
  if (teamIds?.length) {
    teamMatch._id = { $in: teamIds };
  }
  if (searchKey) {
    teamMatch.name = { $regex: searchKey, $options: 'i' };
  }

  // 分页查询团队
  const [paginatedTeams, total] = await Promise.all([
    MongoTeam.find(teamMatch)
      .sort({ _id: 1 }) // 可根据业务需求调整排序字段
      .skip(offset)
      .limit(pageSize)
      .lean<TeamSchema[]>(),
    MongoTeam.countDocuments(teamMatch)
  ]);

  const teamIdsFromPage = paginatedTeams.map((team) => String(team._id));

  // 构建 usage 查询条件
  const usageMatch: any = {
    teamId: { $in: teamIdsFromPage }
  };

  if (dateStart && dateEnd) {
    usageMatch.time = {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    };
  }

  // 查询当前页团队 ID 范围内的所有 usage 记录
  const usageList = await MongoUsage.find(usageMatch).lean<UsageSchemaType[]>();

  // 内存中统计每个 teamId 的 totalPoints
  const usageMap: Record<
    string,
    {
      totalPoints: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      models: {
        name: string;
        input: number;
        output: number;
        amount: number;
        charsLength: number;
        pages: number;
        duration: number;
      }[];
    }
  > = {};

  usageList.forEach((usage) => {
    const teamId = usage.teamId;
    const models = usage.list || [];

    if (!usageMap[teamId]) {
      usageMap[teamId] = {
        totalPoints: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        models: []
      };
    }

    const teamStats = usageMap[teamId];

    teamStats.totalPoints += usage.totalPoints || 0;

    models.forEach((modelUsage) => {
      const {
        model,
        inputTokens = 0,
        outputTokens = 0,
        amount = 0,
        charsLength = 0,
        duration = 0,
        pages = 0
      } = modelUsage;

      if (!model) return;

      // 累加团队总 token
      teamStats.totalInputTokens += inputTokens;
      teamStats.totalOutputTokens += outputTokens;

      // 查找该模型是否已存在
      const existingModel = teamStats.models.find((m) => m.name === model);

      if (existingModel) {
        existingModel.input += inputTokens;
        existingModel.output += outputTokens;
        existingModel.amount += amount;
        existingModel.charsLength += charsLength;
        existingModel.pages += pages;
        existingModel.duration += duration;
      } else {
        teamStats.models.push({
          name: model,
          input: inputTokens,
          output: outputTokens,
          amount,
          charsLength,
          pages,
          duration
        });
      }
    });
  });

  // 获取团队的ownerIdList,并且去重
  const ownerUserIds = [...new Set(paginatedTeams.map((t) => t.ownerId).filter(Boolean))]; // 批量查询用户信息,存到 map中
  // 1. 查询用户信息
  const ownerUsers = await MongoUser.find({
    _id: { $in: ownerUserIds }
  }).lean();

  // 2. 构建用户信息Map
  const userMap = ownerUsers.reduce(
    (acc, user) => {
      acc[user._id] = user;
      return acc;
    },
    {} as Record<string, UserModelSchema>
  );

  const formatTokenAmount = (value: number): string => {
    const abs = Math.abs(value);
    if (abs >= 1e9) {
      return (value / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    } else if (abs >= 1e6) {
      return (value / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    } else if (abs >= 1e3) {
      return (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    } else {
      return value.toString();
    }
  };

  // 合并团队信息
  const result = paginatedTeams.map((team) => {
    const ownerId = team.ownerId || '';
    const username = ownerId && userMap[ownerId] ? userMap[ownerId].username : '-';
    const teamId = String(team._id);
    const stats = usageMap[teamId] || {
      totalPoints: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      models: []
    };

    return {
      id: teamId,
      teamName: team.name || teamId,
      teamAvatar: team.avatar || '/icon/logo.svg',
      owner: username,
      totalPoints: stats.totalPoints,
      totalInputTokens: formatTokenAmount(stats.totalInputTokens),
      totalOutputTokens: formatTokenAmount(stats.totalOutputTokens),
      totalTokens: formatTokenAmount(stats.totalInputTokens + stats.totalOutputTokens),
      models: stats.models.map((model) => ({
        name: model.name,
        inputTokens: formatTokenAmount(model.input),
        outputTokens: formatTokenAmount(model.output),
        allTokens: formatTokenAmount(model.input + model.output),
        amount: model.amount,
        charsLength: formatTokenAmount(model.charsLength),
        pages: formatTokenAmount(model.pages),
        duration: model.duration?.toLocaleString() || '0'
      }))
    };
  });
  return {
    list: result,
    total
  };
};

export const getUsages = async (
  { dateStart, dateEnd, sources, teamMemberIds, projectName }: GetUsageProps,
  teamId: string,
  offset: number,
  pageSize: number
): Promise<PaginationResponse<UsageItemType>> => {
  const match: any = {
    teamId
  };

  // 时间范围过滤
  if (dateStart && dateEnd) {
    match.time = {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    };
  }

  // 来源过滤
  if (sources?.length) {
    match.source = { $in: sources };
  }

  // 团队成员过滤
  if (teamMemberIds?.length) {
    match.tmbId = { $in: teamMemberIds };
  }

  // 项目名称过滤
  if (projectName) {
    match.appName = { $regex: projectName, $options: 'i' };
  }

  try {
    // 执行分页查询
    const [usages, total] = await Promise.all([
      MongoUsage.find(match)
        .sort({ time: -1 })
        .skip(offset)
        .limit(pageSize)
        .lean<UsageSchemaType[]>(),
      MongoUsage.countDocuments(match)
    ]);

    // 查询团队成员信息
    let teamMembersMap: {
      [key: string]: { name: string; avatar: string; status: TeamMemberStatusEnum };
    } = {};
    if (usages?.length) {
      const tmbIds = usages.map((usage) => usage.tmbId);
      const teamMembers = await MongoTeamMember.find({
        _id: { $in: tmbIds }
      })
        .select('name avatar status')
        .lean();

      teamMembersMap = teamMembers.reduce(
        (acc, member) => {
          acc[member._id] = {
            name: member.name,
            avatar: member.avatar,
            status: member.status as TeamMemberStatusEnum
          };
          return acc;
        },
        {} as { [key: string]: { name: string; avatar: string; status: TeamMemberStatusEnum } }
      );
    }

    return {
      list: usages.map((usage) => {
        const teamMember = teamMembersMap[usage.tmbId] || {
          name: '',
          avatar: '',
          status: TeamMemberStatusEnum.active
        };
        return {
          id: String(usage._id),
          time: usage.time,
          appName: usage.appName,
          source: usage.source,
          totalPoints: usage.totalPoints,
          list: usage.list,
          sourceMember: {
            name: teamMember.name,
            avatar: teamMember.avatar,
            status: teamMember.status
          }
        };
      }),
      total
    };
  } catch (error) {
    addLog.error('getUsages error', error);
    throw error;
  }
};

export const getUsageDashboardData = async (
  { dateStart, dateEnd, sources, teamMemberIds, projectName, unit }: GetUsageDashboardProps,
  teamId: string
): Promise<GetUsageDashboardResponseItem[]> => {
  try {
    // 构建基础查询条件
    const query: any = {
      teamId: new Types.ObjectId(teamId)
    };

    // 时间范围过滤
    if (dateStart && dateEnd) {
      query.time = {
        $gte: new Date(dateStart),
        $lte: new Date(dateEnd)
      };
    }

    // 来源过滤
    if (sources?.length) {
      query.source = { $in: sources };
    }

    // 团队成员过滤
    if (teamMemberIds?.length) {
      query.tmbId = { $in: teamMemberIds };
    }

    // 项目名称模糊匹配
    if (projectName) {
      query.appName = { $regex: projectName, $options: 'i' };
    }

    // 执行聚合查询
    const result = await MongoUsage.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: unit === 'day' ? '%Y-%m-%d' : '%Y-%m',
                date: '$time'
              }
            }
          },
          totalPoints: { $sum: '$totalPoints' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    return result.map((item) => ({
      date: new Date(item._id.date),
      totalPoints: item.totalPoints
    }));
  } catch (error) {
    addLog.error('获取仪表盘数据异常:', error);
    throw new Error(`获取使用情况数据失败: ${get(error, 'message', '未知错误')}`);
  }
};
