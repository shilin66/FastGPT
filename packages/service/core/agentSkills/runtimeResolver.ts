import { z } from 'zod';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import {
  RuntimeSkillMetadataSchema,
  type AgentSkillSchemaType,
  type AgentSkillsVersionSchemaType,
  type RuntimeSkillMetadataType
} from '@fastgpt/global/core/agentSkills/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { authSkillByTmbId } from '../../support/permission/agentSkill/auth';
import { MongoAgentSkillsVersion } from './version/schema';
import { downloadSkillPackage } from './storage';
import { validateAndNormalizeSkillPackage } from './packageValidator';

type ResolutionFailure =
  | 'invalid_bindings'
  | 'inaccessible'
  | 'not_ready'
  | 'invalid_version'
  | 'invalid_package';

export class RuntimeSkillResolutionError extends Error {
  constructor(
    readonly reason: ResolutionFailure,
    readonly assistantResponses: AIChatItemValueItemType[] = []
  ) {
    super('skill_unavailable');
    this.name = 'RuntimeSkillResolutionError';
  }
}

export type ResolvedRuntimeSkill = {
  skill: AgentSkillSchemaType;
  version: AgentSkillsVersionSchemaType;
  runtimeSkills: RuntimeSkillMetadataType[];
};

const IdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const BindingsSchema = z.array(z.union([IdSchema, z.object({ skillId: IdSchema })]));

export function getAppRuntimeSkillIds(
  nodes: Pick<StoreNodeItemType, 'flowNodeType' | 'inputs'>[]
): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.flowNodeType !== FlowNodeTypeEnum.agent) continue;
    for (const input of node.inputs) {
      if (input.key !== NodeInputKeyEnum.skills || input.value == null) continue;
      const parsed = BindingsSchema.safeParse(input.value);
      if (!parsed.success) throw new RuntimeSkillResolutionError('invalid_bindings');
      ids.push(...parsed.data.map((item) => (typeof item === 'string' ? item : item.skillId)));
    }
  }
  return [...new Set(ids)];
}

export async function resolveRuntimeSkills({
  skillIds,
  teamId,
  tmbId,
  expectedVersionIds,
  validatePackages = false
}: {
  skillIds: string[];
  teamId: string;
  tmbId: string;
  expectedVersionIds?: Record<string, string>;
  validatePackages?: boolean;
}): Promise<ResolvedRuntimeSkill[]> {
  const parsedIds = z.array(IdSchema).safeParse(skillIds);
  if (!parsedIds.success) throw new RuntimeSkillResolutionError('invalid_bindings');
  const ids = [...new Set(parsedIds.data)];
  if (
    expectedVersionIds &&
    (Object.keys(expectedVersionIds).length !== ids.length ||
      ids.some((id) => !IdSchema.safeParse(expectedVersionIds[id]).success))
  )
    throw new RuntimeSkillResolutionError('invalid_bindings');
  if (!ids.length) return [];

  // Keep the existing ACL authority, including personal deny, group/org and folder inheritance.
  // Finish authorization for the whole set before exposing metadata or reading any package.
  const skills = await Promise.all(
    ids.map(async (skillId) => {
      try {
        const { skill } = await authSkillByTmbId({ tmbId, skillId, per: ReadPermissionVal });
        if (String(skill.teamId) !== teamId) throw new RuntimeSkillResolutionError('inaccessible');
        return skill;
      } catch {
        throw new RuntimeSkillResolutionError('inaccessible');
      }
    })
  );
  if (
    skills.some(
      (skill) =>
        skill.type !== AgentSkillTypeEnum.skill ||
        skill.creationStatus !== AgentSkillCreationStatusEnum.ready
    )
  ) {
    throw new RuntimeSkillResolutionError('not_ready');
  }

  const versions = await MongoAgentSkillsVersion.find({
    isDeleted: false,
    deleteTime: null,
    storageDeletedAt: null,
    $or: skills.map((skill) => {
      const skillId = String(skill._id);
      const versionId = expectedVersionIds?.[skillId] ?? skill.currentVersionId;
      return versionId
        ? { skillId, _id: versionId }
        : {
            skillId,
            $or: [
              { isActive: true },
              ...(skill.currentStorage && typeof skill.currentVersion === 'number'
                ? [{ version: skill.currentVersion }]
                : [])
            ]
          };
    })
  }).lean();

  const resolved = skills.map((skill) => {
    const owned = versions.filter((version) => String(version.skillId) === String(skill._id));
    const versionId = expectedVersionIds?.[String(skill._id)] ?? skill.currentVersionId;
    const candidates = versionId
      ? owned.filter((version) => String(version._id) === String(versionId))
      : (() => {
          const active = owned.filter((version) => version.isActive);
          return active.length
            ? active
            : owned.filter((version) => version.version === skill.currentVersion);
        })();
    if (candidates.length !== 1) throw new RuntimeSkillResolutionError('invalid_version');
    return { skill, version: candidates[0] };
  });

  return Promise.all(
    resolved.map(async ({ skill, version }) => {
      try {
        if (
          !version.storage?.bucket ||
          !version.storage.key ||
          !Number.isFinite(version.storage.size) ||
          version.storage.size <= 0
        ) {
          throw new RuntimeSkillResolutionError('invalid_package');
        }
        const runtimeSkills = await (async () => {
          if (!validatePackages && version.runtimeSkills?.length) return version.runtimeSkills;
          const validated = await validateAndNormalizeSkillPackage(
            await downloadSkillPackage({ storageInfo: version.storage })
          );
          if (version.contentHash && version.contentHash !== validated.contentHash)
            throw new RuntimeSkillResolutionError('invalid_package');
          return validated.runtimeSkills;
        })();
        const metadata = z.array(RuntimeSkillMetadataSchema).nonempty().parse(runtimeSkills);
        const names = new Set<string>();
        for (const item of metadata) {
          const key = item.name.normalize('NFC').toLowerCase();
          if (
            !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(item.name) ||
            item.path !== `skills/${item.name}` ||
            names.has(key)
          ) {
            throw new RuntimeSkillResolutionError('invalid_package');
          }
          names.add(key);
        }
        return { skill, version, runtimeSkills: metadata };
      } catch {
        throw new RuntimeSkillResolutionError('invalid_package');
      }
    })
  );
}
