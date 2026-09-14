import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { validateAndNormalizeSkillPackage } from '../packageValidator';
import { downloadSkillPackage } from '../storage';
import { MongoAgentSkillsVersion } from './schema';

export async function validateSkillVersionPackage({
  skillId,
  versionId
}: {
  skillId: string;
  versionId: string;
}): Promise<void> {
  const version = await MongoAgentSkillsVersion.findOne({
    _id: versionId,
    skillId,
    isDeleted: false
  }).lean();
  if (!version) throw new UserError(SkillErrEnum.versionConflict);

  try {
    const validated = await validateAndNormalizeSkillPackage(
      await downloadSkillPackage({ storageInfo: version.storage })
    );
    if (version.contentHash && validated.contentHash !== version.contentHash) {
      throw new UserError(SkillErrEnum.invalidSkillPackage);
    }
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(SkillErrEnum.invalidSkillPackage);
  }
}
