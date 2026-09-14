import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { MongoChat } from '../../chat/chatSchema';
import { MongoChatItem } from '../../chat/chatItemSchema';
import { MongoChatItemResponse } from '../../chat/chatItemResponseSchema';
import { MongoAgentSkills } from '../schema';
import { deleteSkillRelatedSandboxes } from '../sandboxController';
import { deleteSkillPackage } from '../storage';
import { MongoAgentSkillsVersion } from '../version/schema';
import { AGENT_SKILL_VERSION_RETENTION_MS } from '../version/cleanup';
import { assertSkillDeletionScope, getSkillDeletionScope } from './entity';
import { assertSkillPackageOwnership, assertSkillVersionUnreferenced } from './service';
import { AgentSkillDeleteJobSchema, type AgentSkillDeleteJobData } from './type';

export const cleanupAgentSkillDeletion = async (input: AgentSkillDeleteJobData) => {
  const data = AgentSkillDeleteJobSchema.parse(input);
  const initial = await getSkillDeletionScope(data);
  if (!initial) return;
  const assertAuthorized = async () => {
    const scope = await assertSkillDeletionScope(data);
    if (scope.root.deleteTime?.getTime() !== initial.root.deleteTime?.getTime())
      throw new Error('skill_deletion_operation_conflict');
  };
  const checkpoint = async (next: 'sandbox_deleted' | 'packages_deleted') => {
    await assertAuthorized();
    const updated = await MongoAgentSkills.updateMany(initial.filter, {
      $set: { 'deletionOperation.checkpoint': next, 'deletionOperation.updatedAt': new Date() },
      $unset: { 'deletionOperation.error': 1 }
    });
    if (updated.matchedCount !== initial.memberIds.length)
      throw new Error('skill_deletion_tree_conflict');
  };

  try {
    if (initial.root.deletionOperation?.checkpoint === 'marked') {
      await deleteSkillRelatedSandboxes({
        skillIds: initial.memberIds,
        teamId: data.teamId,
        assertAuthorized
      });
      await checkpoint('sandbox_deleted');
    }

    if (initial.root.deletionOperation?.checkpoint !== 'chat_deleted') {
      await mongoSessionRun(async (session) => {
        const scope = await getSkillDeletionScope(data, session);
        if (!scope) throw new Error('skill_deletion_operation_conflict');
        const source = {
          teamId: data.teamId,
          sourceType: 'skillEdit',
          sourceId: { $in: scope.memberIds }
        };
        await MongoChatItemResponse.deleteMany(source, { session });
        await MongoChatItem.deleteMany(source, { session });
        await MongoChat.deleteMany(source, { session });
        await MongoResourcePermission.deleteMany(
          {
            teamId: data.teamId,
            resourceType: PerResourceTypeEnum.agentSkill,
            resourceId: { $in: scope.memberIds }
          },
          { session }
        );
        const marked = await MongoAgentSkills.updateMany(
          scope.filter,
          {
            $set: {
              'deletionOperation.checkpoint': 'chat_deleted',
              'deletionOperation.updatedAt': new Date()
            },
            $unset: { 'deletionOperation.error': 1 }
          },
          { session }
        );
        if (marked.matchedCount !== scope.memberIds.length)
          throw new Error('skill_deletion_tree_conflict');
      });
    }

    let waitingForRetention = false;
    for (const member of initial.members) {
      if (member.avatar?.includes(imageBaseUrl))
        throw new Error('skill_deletion_avatar_ownership_conflict');
      const versions = await MongoAgentSkillsVersion.find({ skillId: member._id }).lean();
      if (
        member.currentStorage &&
        !versions.some(
          (version) =>
            version.storage.bucket === member.currentStorage?.bucket &&
            version.storage.key === member.currentStorage?.key
        )
      )
        throw new Error('skill_deletion_storage_ownership_conflict');

      for (const version of versions) {
        await assertAuthorized();
        if (
          !version.isDeleted ||
          !version.deleteTime ||
          version.deleteTime.getTime() > initial.root.deleteTime!.getTime()
        )
          throw new Error('skill_deletion_version_conflict');
        await assertSkillPackageOwnership({ teamId: data.teamId, version });
        if (Date.now() - version.deleteTime.getTime() < AGENT_SKILL_VERSION_RETENTION_MS) {
          waitingForRetention = true;
          continue;
        }
        if (version.storageDeletedAt) continue;
        await assertSkillVersionUnreferenced({
          teamId: data.teamId,
          skillId: String(member._id),
          versionId: String(version._id)
        });
        await assertAuthorized();
        await deleteSkillPackage(version.storage);
        await assertAuthorized();
        const removed = await MongoAgentSkillsVersion.updateOne(
          {
            _id: version._id,
            skillId: member._id,
            isDeleted: true,
            deleteTime: version.deleteTime,
            storageDeletedAt: null,
            'storage.bucket': version.storage.bucket,
            'storage.key': version.storage.key
          },
          { $set: { storageDeletedAt: new Date() } }
        );
        if (removed.matchedCount !== 1) throw new Error('skill_deletion_version_conflict');
      }
    }
    if (waitingForRetention) return;
    await checkpoint('packages_deleted');

    await mongoSessionRun(async (session) => {
      const scope = await getSkillDeletionScope(data, session);
      if (!scope) throw new Error('skill_deletion_operation_conflict');
      if (
        await MongoAgentSkillsVersion.exists({
          skillId: { $in: scope.memberIds },
          $or: [
            { isDeleted: { $ne: true } },
            { storageDeletedAt: null },
            { deleteTime: null },
            {
              deleteTime: {
                $gt: new Date(
                  Math.min(
                    Date.now() - AGENT_SKILL_VERSION_RETENTION_MS,
                    scope.root.deleteTime!.getTime()
                  )
                )
              }
            }
          ]
        }).session(session)
      )
        throw new Error('skill_deletion_version_conflict');
      const removed = await MongoAgentSkills.deleteMany(scope.filter, { session });
      if (removed.deletedCount !== scope.memberIds.length)
        throw new Error('skill_deletion_tree_conflict');
    });
  } catch (error) {
    await MongoAgentSkills.updateMany(initial.filter, {
      $set: {
        'deletionOperation.error': 'skill_deletion_cleanup_failed',
        'deletionOperation.updatedAt': new Date()
      }
    });
    throw error;
  }
};
