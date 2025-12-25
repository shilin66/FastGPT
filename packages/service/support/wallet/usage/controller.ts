import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { type ClientSession, Types } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps,
  GetTeamUsageProps,
  GetUsageProps,
  GetUsageDashboardProps,
  GetUsageDashboardResponseItem
} from '@fastgpt/global/support/wallet/usage/api';
import { i18nT } from '../../../../web/i18n/utils';
import { formatModelChars2Points } from './utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoUsageItem } from './usageItemSchema';
import { MongoTeam } from '../../user/team/teamSchema';
import type { TeamSchema } from '@fastgpt/global/support/user/team/type';
import type { PaginationResponse } from '../../../../web/common/fetch/type';
import type {
  TeamUsageItemType,
  UsageItemType,
  UsageListItemType,
  UsageSchemaType
} from '@fastgpt/global/support/wallet/usage/type';
import { MongoUser } from '../../user/schema';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
import { get } from 'lodash';

export async function createUsage(data: CreateUsageProps) {
  try {
    const [{ _id: usageId }] = await MongoUsage.create([
      {
        teamId: data.teamId,
        tmbId: data.tmbId,
        appName: data.appName,
        appId: data.appId,
        totalPoints: data.totalPoints,
        source: data.source
        // list: data.list
      }
    ]);
    await pushUsageItems({
      teamId: data.teamId,
      usageId,
      list: data.list as UsageItemType[]
    });
  } catch (error) {
    addLog.error('createUsage error', error);
  }
}

export async function concatUsage(data: ConcatUsageProps) {
  const { usageId, teamId, inputTokens = 0, outputTokens = 0, totalPoints = 0, itemType } = data;

  try {
    // 根据itemType和usageId 获取usageItem，累加inputTokens，outputTokens， totalPoints 并更新
    await MongoUsageItem.updateOne(
      { usageId, itemType },
      {
        $inc: {
          inputTokens,
          outputTokens,
          amount: totalPoints
        }
      }
    );

    // 更新主usage记录的totalPoints
    await MongoUsage.updateOne(
      { _id: usageId },
      {
        $inc: {
          totalPoints
        }
      }
    );
  } catch (error) {
    addLog.error('concatUsage error', error);
  }
}
export async function pushUsageItems(data: PushUsageItemsProps) {
  try {
    const { teamId, usageId, list } = data;
    // 将list 添加到 MongoUsageItem
    if (list.length === 0) return;

    const itemsToInsert = list.map((item) => ({
      teamId,
      usageId,
      name: item.moduleName,
      amount: item.amount,
      itemType: item.itemType,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      charsLength: item.charsLength,
      duration: item.duration,
      pages: item.pages,
      count: item.count
    }));
    await MongoUsageItem.insertMany(itemsToInsert);
  } catch (error) {
    addLog.error('pushUsageItems error', error);
  }
}

export const createPdfParseUsage = async ({
  teamId,
  tmbId,
  pages,
  parserName,
  usageId
}: {
  teamId: string;
  tmbId: string;
  pages: number;
  parserName?: string;
  usageId?: string;
}) => {
  const parsers = (global as any).systemEnv?.customPdfParse || [];
  const selectedParser = parserName ? parsers.find((p: any) => p.name === parserName) : parsers[0];
  const unitPrice = selectedParser?.price || 0;
  const totalPoints = pages * unitPrice;

  if (usageId) {
    pushUsageItems({
      teamId,
      usageId,
      list: [{ moduleName: i18nT('account_usage:pdf_enhanced_parse'), amount: totalPoints, pages }]
    });
  } else {
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
          model: `Pdf Parse - ${selectedParser?.name}`,
          pages
        }
      ]
    });
  }
};
export const pushLLMTrainingUsage = async ({
  teamId,
  model,
  inputTokens,
  outputTokens,
  usageId,
  type
}: {
  teamId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usageId: string;
  type: UsageItemTypeEnum;
}) => {
  // Compute points
  const { totalPoints } = formatModelChars2Points({
    model,
    inputTokens,
    outputTokens
  });

  concatUsage({
    usageId,
    teamId,
    itemType: type,
    totalPoints,
    inputTokens,
    outputTokens
  });

  return { totalPoints };
};

/* Create usage, and return usageId */
// Chat
export const createChatUsageRecord = async ({
  appName,
  appId,
  pluginId,
  teamId,
  tmbId,
  source
}: {
  appName: string;
  appId?: string;
  pluginId?: string;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
}) => {
  const [{ _id: usageId }] = await MongoUsage.create(
    [
      {
        teamId,
        tmbId,
        appId,
        pluginId,
        appName,
        source,
        totalPoints: 0
      }
    ],
    { ordered: true }
  );
  return String(usageId);
};
export const pushChatItemUsage = ({
  teamId,
  usageId,
  nodeUsages
}: {
  teamId: string;
  usageId: string;
  nodeUsages: ChatNodeUsageType[];
}) => {
  pushUsageItems({
    teamId,
    usageId,
    list: nodeUsages.map((item) => ({
      moduleName: item.moduleName,
      amount: item.totalPoints,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens
    }))
  });
};

// Dataset training
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

  vectorModel: string;
  agentModel?: string;
  vllmModel?: string;
  session?: ClientSession;
}) => {
  const create = async (session: ClientSession) => {
    const [result] = await MongoUsage.create(
      [
        {
          teamId,
          tmbId,
          source: billSource,
          appName,
          totalPoints: 0
        }
      ],
      { session, ordered: true }
    );
    await MongoUsageItem.create(
      [
        {
          teamId,
          usageId: result._id,
          itemType: UsageItemTypeEnum.training_vector,
          name: i18nT('account_usage:embedding_index'),
          model: vectorModel,
          amount: 0,
          inputTokens: 0
        },
        ...(agentModel
          ? [
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_paragraph,
                name: i18nT('account_usage:llm_paragraph'),
                model: agentModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_qa,
                name: i18nT('account_usage:qa'),
                model: agentModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_autoIndex,
                name: i18nT('account_usage:auto_index'),
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
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_imageIndex,
                name: i18nT('account_usage:image_index'),
                model: vllmModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_imageParse,
                name: i18nT('account_usage:image_parse'),
                model: vllmModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              }
            ]
          : [])
      ],
      {
        session,
        ordered: true
      }
    );

    return { usageId: String(result._id) };
  };
  if (session) return create(session);
  return mongoSessionRun(create);
};

// Evaluation
export const createEvaluationUsage = async ({
  teamId,
  tmbId,
  appName,
  model
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  model: string;
}) => {
  const { usageId } = await mongoSessionRun(async (session) => {
    const [{ _id: usageId }] = await MongoUsage.create(
      [
        {
          teamId,
          tmbId,
          appName,
          source: UsageSourceEnum.evaluation,
          totalPoints: 0
        }
      ],
      { session, ordered: true }
    );
    await MongoUsageItem.create(
      [
        {
          teamId,
          usageId,
          itemType: UsageItemTypeEnum.evaluation_generateAnswer,
          name: i18nT('account_usage:generate_answer'),
          amount: 0,
          count: 0
        },
        {
          teamId,
          usageId,
          itemType: UsageItemTypeEnum.evaluation_answerAccuracy,
          name: i18nT('account_usage:answer_accuracy'),
          amount: 0,
          inputTokens: 0,
          outputTokens: 0,
          model
        }
      ],
      {
        session,
        ordered: true
      }
    );

    return { usageId: String(usageId) };
  });

  return { usageId };
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
      .lean() as unknown as TeamSchema[],
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
  const usageList = (await MongoUsage.find(usageMatch).lean()) as unknown as UsageSchemaType[];

  // 获取所有 usage 记录的 IDs
  const usageIds = usageList.map((usage) => usage._id);

  // 根据 usageIds 查询对应的 usageItem 记录
  let usageItemList: any[] = [];
  if (usageIds.length > 0) {
    usageItemList = await MongoUsageItem.find({
      usageId: { $in: usageIds }
    }).lean();
  }

  // 内存中统计每个 teamId 的 totalPoints 和模型使用情况
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

  // 初始化 usageMap，确保所有团队都有条目
  usageList.forEach((usage: any) => {
    const teamId = usage.teamId;
    if (!usageMap[teamId]) {
      usageMap[teamId] = {
        totalPoints: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        models: []
      };
    }
    // 累加总的 points
    usageMap[teamId].totalPoints += usage.totalPoints || 0;
  });

  // 处理 usageItem 数据
  usageItemList.forEach((usageItem: any) => {
    const usage = usageList.find((u) => u._id.toString() === usageItem.usageId.toString());
    if (!usage) return;

    const teamId = usage.teamId;
    if (!usageMap[teamId]) {
      usageMap[teamId] = {
        totalPoints: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        models: []
      };
    }

    const teamStats = usageMap[teamId];
    const {
      model,
      inputTokens = 0,
      outputTokens = 0,
      amount = 0,
      charsLength = 0,
      duration = 0,
      pages = 0
    } = usageItem;

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

  // 获取团队的ownerIdList,并且去重
  const ownerUserIds = [...new Set(paginatedTeams.map((t) => t.ownerId).filter(Boolean))]; // 批量查询用户信息,存到 map中
  // 1. 查询用户信息
  const ownerUsers = await MongoUser.find({
    _id: { $in: ownerUserIds }
  }).lean();

  // 2. 构建用户信息Map
  const userMap = ownerUsers.reduce(
    (acc: any, user: any) => {
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
  { dateStart, dateEnd, sources, teamMemberIds = [], projectName }: GetUsageProps,
  teamId: string,
  offset: number,
  pageSize: number
): Promise<PaginationResponse<UsageListItemType>> => {
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
        .lean() as unknown as UsageSchemaType[],
      MongoUsage.countDocuments(match)
    ]);

    // 根据查询到的usage记录IDs，去MongoUsageItem中查询详细的记录详情
    let usageDetailsMap: Record<string, any[]> = {};
    if (usages?.length) {
      const usageIds = usages.map((usage) => usage._id);
      const usageItems = await MongoUsageItem.find({
        usageId: { $in: usageIds }
      }).lean();

      // 将usage items按usageId分组
      usageDetailsMap = usageItems.reduce(
        (acc: any, item: any) => {
          const usageId = item.usageId.toString();
          if (!acc[usageId]) {
            acc[usageId] = [];
          }
          acc[usageId].push(item);
          return acc;
        },
        {} as Record<string, any[]>
      );
    }

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
        (acc: any, member: any) => {
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

        // 合并usage主记录和从MongoUsageItem查询到的详细记录
        const usageDetails = usageDetailsMap[usage._id.toString()] || [];
        const usageDetailItems = usageDetails.map((item) => ({
          moduleName: item.name,
          amount: item.amount,
          model: item.model,
          inputTokens: item.inputTokens,
          outputTokens: item.outputTokens,
          count: item.count,
          charsLength: item.charsLength,
          duration: item.duration,
          pages: item.pages
        }));

        // 如果 usage.list 存在且需要合并，请确保它也符合 Omit<UsageItemType, "itemType"> 结构
        const usageListItems = Array.isArray(usage.list)
          ? usage.list.map(({ itemType, ...rest }) => rest)
          : [];

        const usageList = [...usageDetailItems, ...usageListItems];
        return {
          id: String(usage._id),
          time: usage.time,
          appName: usage.appName,
          source: usage.source,
          totalPoints: usage.totalPoints,
          list: usageList,
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
      query.tmbId = { $in: teamMemberIds.map((item) => new Types.ObjectId(item)) };
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

    return result.map((item: any) => ({
      date: new Date(item._id.date),
      totalPoints: item.totalPoints
    }));
  } catch (error) {
    addLog.error('获取仪表盘数据异常:', error);
    throw new Error(`获取使用情况数据失败: ${get(error, 'message', '未知错误')}`);
  }
};
