import { NextAPI } from '@/service/middleware/entry';
import { createHash, randomUUID } from 'node:crypto';
import { CreateSkillBodySchema } from '@fastgpt/global/openapi/core/agentSkills/api';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertTeamWritable } from '@fastgpt/service/support/user/team/status';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createSkill, checkSkillNameExists } from '@fastgpt/service/core/agentSkills/controller';
import type { CreateSkillBody, CreateSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import {
  AgentSkillCategoryEnum,
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import {
  WritePermissionVal,
  PerResourceTypeEnum,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { Types } from '@fastgpt/service/common/mongo';
import {
  addAgentSkillInitializeJob,
  markAgentSkillInitializationFailed
} from '@fastgpt/service/core/agentSkills/initialize';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

async function handler(req: ApiRequestProps<CreateSkillBody>): Promise<CreateSkillResponse> {
  const {
    parentId,
    name,
    description,
    category = [],
    config = {},
    avatar,
    requestId
  } = CreateSkillBodySchema.parse(req.body);

  // Authenticate user: if parentId exists, verify parent folder permission
  const { teamId, tmbId, userId } = parentId
    ? await authSkill({
        req,
        skillId: parentId,
        per: WritePermissionVal,
        authToken: true,
        authApiKey: true
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamSkillCreatePermissionVal
      });
  await assertTeamWritable(teamId, WritePermissionVal);
  if (
    parentId &&
    !(await MongoAgentSkills.exists({
      _id: parentId,
      teamId,
      type: AgentSkillTypeEnum.folder,
      deleteTime: null
    }))
  )
    throw new Error('Skill parent must be an existing folder');

  const requestedSkillId = requestId
    ? createHash('sha256')
        .update(JSON.stringify(['skill-create', teamId, tmbId, requestId]))
        .digest('hex')
        .slice(0, 24)
    : undefined;
  const findExistingRequest = () =>
    requestedSkillId
      ? MongoAgentSkills.findOne({
          _id: requestedSkillId,
          teamId,
          tmbId,
          creationRequestId: requestId,
          deleteTime: null
        }).lean()
      : Promise.resolve(null);
  const existingRequest = await findExistingRequest();
  if (existingRequest) return String(existingRequest._id);

  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Promise.reject(SkillErrEnum.invalidSkillName);
  }
  if (name.length > 50) {
    return Promise.reject(SkillErrEnum.skillNameTooLong);
  }
  if (description && description.length > 500) {
    return Promise.reject(SkillErrEnum.invalidDescription);
  }
  const validCategories = Object.values(AgentSkillCategoryEnum) as string[];
  if (category.length > 0 && category.some((c) => !validCategories.includes(c))) {
    return Promise.reject(SkillErrEnum.invalidCategory);
  }
  if (config && JSON.stringify(config).length > 50_000) {
    return Promise.reject(SkillErrEnum.invalidConfig);
  }

  // Check if skill name already exists in the same parent folder
  const nameExists = await checkSkillNameExists(name.trim(), teamId, parentId || null);
  if (nameExists) {
    const existing = await findExistingRequest();
    if (existing) return String(existing._id);
    return Promise.reject(SkillErrEnum.skillNameExists);
  }

  const operationId = randomUUID();
  const versionId = new Types.ObjectId().toHexString();
  const skillId = await mongoSessionRun(async (session) => {
    const newSkillId = await createSkill(
      {
        skillId: requestedSkillId,
        creationRequestId: requestId,
        parentId: parentId || null,
        name: name.trim(),
        description: description?.trim() || '',
        author: userId || '',
        category: category.length > 0 ? category : [AgentSkillCategoryEnum.other],
        config,
        avatar,
        teamId,
        tmbId,
        creationStatus: AgentSkillCreationStatusEnum.pending,
        lastOperationId: operationId
      },
      session
    );

    await MongoResourcePermission.insertOne(
      {
        teamId,
        tmbId,
        resourceId: newSkillId,
        permission: OwnerRoleVal,
        resourceType: PerResourceTypeEnum.agentSkill
      },
      { session }
    );

    await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

    return newSkillId;
  }).catch(async (error: unknown) => {
    const existing = await findExistingRequest();
    if (existing) return String(existing._id);
    throw error;
  });

  if (requestedSkillId) {
    const existing = await findExistingRequest();
    if (existing?.lastOperationId !== operationId) return skillId;
  }

  try {
    await addAgentSkillInitializeJob({ skillId, teamId, tmbId, operationId, versionId });
  } catch (error) {
    logger.error('Failed to enqueue Agent Skill initialization', { skillId, operationId, error });
    await markAgentSkillInitializationFailed({
      skillId,
      operationId,
      code: 'initialization_queue_unavailable',
      message: 'Skill initialization queue is unavailable'
    });
  }

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_SKILL,
      params: { skillName: name.trim(), skillType: getI18nSkillType(AgentSkillTypeEnum.skill) }
    });
  })();

  return skillId;
}

export default NextAPI(handler);
