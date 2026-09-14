import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { MongoAgentSkills } from '../schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { MongoSandboxInstance } from '../../ai/sandbox/schema';
import { getSkillCandidateStorageKey, getSkillStorageKey } from '../storage';
import { S3Buckets } from '../../../common/s3/config/constants';
import { Types } from '../../../common/mongo';
import { MongoChatItem } from '../../chat/chatItemSchema';
import { AIChatItemValueSchema } from '@fastgpt/global/core/chat/type';
import { z } from 'zod';

const PausedVersionMemorySchema = z.record(z.string(), z.unknown());
const PausedVersionReferenceSchema = z.object({
  status: z.literal('paused'),
  providerState: z.object({ sandboxSkillVersions: z.record(z.string(), z.string()) })
});

export const assertSkillPackageOwnership = async ({
  teamId,
  version
}: {
  teamId: string;
  version: AgentSkillsVersionSchemaType;
}) => {
  const { storage } = version;
  const skillId = String(version.skillId);
  if (
    storage.bucket !== S3Buckets.private ||
    (storage.key !== getSkillCandidateStorageKey(teamId, skillId, String(version._id)) &&
      storage.key !== getSkillStorageKey(teamId, skillId, version.version)) ||
    (version.storageKey && version.storageKey !== storage.key)
  ) {
    throw new Error('skill_deletion_storage_ownership_conflict');
  }
  const [otherVersion, otherSkill] = await Promise.all([
    MongoAgentSkillsVersion.exists({
      _id: { $ne: version._id },
      'storage.bucket': storage.bucket,
      'storage.key': storage.key
    }),
    MongoAgentSkills.exists({
      _id: { $ne: version.skillId },
      'currentStorage.bucket': storage.bucket,
      'currentStorage.key': storage.key
    })
  ]);
  if (otherVersion || otherSkill) throw new Error('skill_deletion_shared_storage_conflict');
};

export const assertSkillVersionUnreferenced = async ({
  teamId,
  skillId,
  versionId
}: {
  teamId: string;
  skillId: string;
  versionId: string;
}) => {
  // Existing runtime metadata records Skill IDs, so retain all versions while that binding exists.
  const reference = await MongoSandboxInstance.exists({
    $or: [
      { baseVersionId: versionId },
      { 'metadata.skillIds': skillId },
      { sourceType: 'skillEdit', sourceId: skillId },
      { 'metadata.skillId': skillId }
    ]
  });
  if (reference) throw new Error('skill_version_runtime_reference_conflict');

  const latest = MongoChatItem.aggregate<{ memories: unknown; value: unknown }>([
    { $match: { teamId: new Types.ObjectId(teamId), obj: 'AI', deleteTime: null } },
    { $sort: { _id: -1 } },
    {
      $group: {
        _id: {
          appId: '$appId',
          chatId: '$chatId',
          sourceType: '$sourceType',
          sourceId: '$sourceId'
        },
        memories: { $first: '$memories' },
        value: { $first: '$value' }
      }
    }
  ]).cursor();
  for await (const item of latest) {
    const memories = PausedVersionMemorySchema.safeParse(item.memories);
    if (!memories.success) continue;
    const referencingNodes = Object.entries(memories.data).flatMap(([key, value]) => {
      if (!key.startsWith('agentLoopMemory-')) return [];
      const memory = PausedVersionReferenceSchema.safeParse(value);
      return memory.success && memory.data.providerState.sandboxSkillVersions[skillId] === versionId
        ? [key.slice('agentLoopMemory-'.length)]
        : [];
    });
    if (referencingNodes.length === 0) continue;
    const values = z.array(AIChatItemValueSchema).safeParse(item.value);
    if (!values.success) throw new Error('skill_version_runtime_reference_conflict');
    const interactive = values.data.at(-1)?.interactive;
    if (!interactive) continue;
    const pending =
      (interactive.type === 'agentPlanAskQuery' && !interactive.params.answer) ||
      (interactive.type === 'agentPlanAskUserForm' && !interactive.params.submitted) ||
      (interactive.type === 'agentPlanAskUserSelect' && !interactive.params.userSelectedVal) ||
      (interactive.type === 'agentPlanCheck' && !interactive.params.confirmed);
    if (!pending) continue;
    if (interactive.entryNodeIds.some((nodeId) => referencingNodes.includes(nodeId))) {
      throw new Error('skill_version_runtime_reference_conflict');
    }
  }
};
