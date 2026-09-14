import type { ClientSession } from '../../../common/mongo';
import { MongoAgentSkills } from '../schema';
import type { AgentSkillDeleteJobData } from './type';

export const getSkillDeletionScope = async (
  data: AgentSkillDeleteJobData,
  session?: ClientSession
) => {
  const root = await MongoAgentSkills.findOne(
    {
      _id: data.skillId,
      teamId: data.teamId,
      deleteTime: new Date(data.deleteTime),
      'deletionOperation.id': data.operationId,
      'deletionOperation.rootId': data.skillId
    },
    undefined,
    { session }
  ).lean();
  if (!root?.deleteTime || !root.deletionOperation) return null;
  const memberIds = root.deletionOperation.memberIds.map(String);
  if (!memberIds.includes(data.skillId) || new Set(memberIds).size !== memberIds.length) {
    throw new Error('skill_deletion_tree_conflict');
  }
  const filter = {
    _id: { $in: memberIds },
    teamId: data.teamId,
    deleteTime: root.deleteTime,
    'deletionOperation.id': data.operationId,
    'deletionOperation.rootId': data.skillId
  };
  const members = await MongoAgentSkills.find(filter, undefined, { session }).lean();
  if (
    members.length !== memberIds.length ||
    members.some(
      (member) =>
        member.source === 'system' ||
        member.deletionOperation?.memberIds.map(String).join(',') !== memberIds.join(',') ||
        (String(member._id) !== data.skillId && !memberIds.includes(String(member.parentId)))
    ) ||
    (await MongoAgentSkills.exists({
      parentId: { $in: memberIds },
      _id: { $nin: memberIds }
    }).session(session ?? null))
  ) {
    throw new Error('skill_deletion_tree_conflict');
  }
  return { root, members, memberIds, filter };
};

export const assertSkillDeletionScope = async (data: AgentSkillDeleteJobData) => {
  const scope = await getSkillDeletionScope(data);
  if (!scope) throw new Error('skill_deletion_operation_conflict');
  return scope;
};
