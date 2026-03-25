import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { Types } from 'mongoose';
import type { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { responseWriteController } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.QUEUES);
async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const {
    dateStart,
    dateEnd,
    sources,
    teamMemberIds = [],
    projectName,
    appNameMap = {},
    sourcesMap = {},
    title = 'Usage Records'
  } = req.body;

  const { tmbId, teamId, permission } = await authUserPer({
    req,
    authToken: true,
    per: TeamReadPermissionVal
  });

  if (!tmbId) {
    throw new Error('user not found');
  }

  // 构建查询条件
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
  if (!permission.hasManagePer) {
    query.tmbId = new Types.ObjectId(tmbId);
  } else if (teamMemberIds?.length) {
    query.tmbId = { $in: teamMemberIds.map((id: number) => new Types.ObjectId(id)) };
  }

  // 项目名称过滤
  if (projectName) {
    query.appName = { $regex: projectName, $options: 'i' };
  }

  // 设置响应头
  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader('Content-Disposition', `attachment; filename=usage-${Date.now()}.csv; `);

  // 创建成员信息缓存映射表
  const teamMemberMap: Record<string, TeamMemberSchema> = {};

  // 分批查询成员信息的辅助函数
  const MEMBER_BATCH_SIZE = 2000;
  const fetchMembersInBatches = async (tmbIds: string[]) => {
    const uniqueTmbIds = tmbIds.filter((id) => !teamMemberMap[id]);
    if (uniqueTmbIds.length === 0) return;

    // 分批查询，每批100个
    for (let i = 0; i < uniqueTmbIds.length; i += MEMBER_BATCH_SIZE) {
      const batchIds = uniqueTmbIds.slice(i, i + MEMBER_BATCH_SIZE);
      const teamMembers = await MongoTeamMember.find({
        _id: { $in: batchIds.map((id) => new Types.ObjectId(id)) }
      })
        .select('name avatar status')
        .lean();

      teamMembers.forEach((member) => {
        teamMemberMap[member._id.toString()] = member;
      });
    }
  };

  // 现在开始流式输出CSV，每批2000条
  const USAGE_BATCH_SIZE = 2000;
  const cursor = MongoUsage.find(query).sort({ time: -1 }).batchSize(USAGE_BATCH_SIZE).cursor();

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  // 写入BOM和CSV头部
  write(`\uFEFFTime,User Name,Project Name,Source Type,Total Points`);

  // 缓存当前批次的使用记录，用于批量查询成员信息
  let currentBatch: any[] = [];

  // 监听游标数据事件
  cursor.on('data', async (usage: any) => {
    currentBatch.push(usage);

    // 当达到批次大小时，暂停游标，查询成员信息，然后写入数据
    if (currentBatch.length >= USAGE_BATCH_SIZE) {
      cursor.pause();

      // 提取当前批次中的所有tmbId
      const tmbIds = currentBatch.map((u) => u.tmbId.toString());
      await fetchMembersInBatches(tmbIds);

      // 写入当前批次的所有记录
      for (const usage of currentBatch) {
        const teamMember = teamMemberMap[usage.tmbId.toString()];
        const time = new Date(usage.time).toISOString();
        const userName = sanitizeCsvField(teamMember?.name || '');
        const sanitizedAppName = sanitizeCsvField(appNameMap[usage.appName] || usage.appName || '');

        // 修复索引类型错误
        const usageSource = usage.source as UsageSourceEnum;
        const sourceLabel =
          (sourcesMap as Record<string, any>)[usageSource]?.label ||
          UsageSourceMap[usageSource]?.label ||
          usageSource;
        const sanitizedSource = sanitizeCsvField(sourceLabel || '');
        const totalPoints = usage.totalPoints || 0;

        write(
          `\n${sanitizeCsvField(time)},${userName},${sanitizedAppName},${sanitizedSource},${totalPoints}`
        );
      }

      currentBatch = [];
      cursor.resume();
    }
  });

  // 游标结束事件
  cursor.on('end', async () => {
    // 处理剩余的记录（不足一个批次的部分）
    if (currentBatch.length > 0) {
      const tmbIds = currentBatch.map((u) => u.tmbId.toString());
      await fetchMembersInBatches(tmbIds);

      for (const usage of currentBatch) {
        const teamMember = teamMemberMap[usage.tmbId.toString()];
        const time = new Date(usage.time).toISOString();
        const userName = sanitizeCsvField(teamMember?.name || '');
        const sanitizedAppName = sanitizeCsvField(appNameMap[usage.appName] || usage.appName || '');

        const usageSource = usage.source as UsageSourceEnum;
        const sourceLabel =
          (sourcesMap as Record<string, any>)[usageSource]?.label ||
          UsageSourceMap[usageSource]?.label ||
          usageSource;
        const sanitizedSource = sanitizeCsvField(sourceLabel || '');
        const totalPoints = usage.totalPoints || 0;

        write(
          `\n${sanitizeCsvField(time)},${userName},${sanitizedAppName},${sanitizedSource},${totalPoints}`
        );
      }
    }

    cursor.close();
    res.end();
  });

  // 错误处理
  cursor.on('error', (err) => {
    logger.error('export usage error', err);
    res.status(500);
    res.end();
  });
}

export default NextAPI(handler);
