import type { Processor } from 'bullmq';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/agentSkills/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { createEmptySkillWorkspace } from '../zipBuilder';
import { validateAndNormalizeSkillPackage } from '../packageValidator';
import { finalizeStagedSkillPackage, stageSkillPackage } from '../storage';
import { MongoAgentSkills } from '../schema';
import { createVersion } from '../version/controller';
import { setCurrentVersion } from '../version/current';
import type { AgentSkillInitializeJobData } from './index';

export async function initializeAgentSkill({
  skillId,
  teamId,
  tmbId,
  operationId,
  versionId
}: AgentSkillInitializeJobData): Promise<void> {
  const claimed = await MongoAgentSkills.findOneAndUpdate(
    {
      _id: skillId,
      teamId,
      deleteTime: null,
      lastOperationId: operationId,
      currentVersionId: { $exists: false },
      creationStatus: {
        $in: [AgentSkillCreationStatusEnum.pending, AgentSkillCreationStatusEnum.failed]
      }
    },
    {
      $set: {
        creationStatus: AgentSkillCreationStatusEnum.initializing,
        updateTime: new Date()
      },
      $unset: { error: 1 }
    },
    { new: true }
  ).lean();

  if (!claimed) return;

  try {
    const validatedPackage = await validateAndNormalizeSkillPackage(
      await createEmptySkillWorkspace(),
      { allowLegacyLayout: false, allowEmptyWorkspace: true }
    );
    const storage = await stageSkillPackage({
      teamId,
      skillId,
      versionId,
      zipBuffer: validatedPackage.zipBuffer,
      checksum: validatedPackage.contentHash
    });

    await mongoSessionRun(async (session) => {
      const currentSkill = await MongoAgentSkills.findOne(
        {
          _id: skillId,
          teamId,
          deleteTime: null,
          lastOperationId: operationId,
          currentVersionId: { $exists: false },
          creationStatus: AgentSkillCreationStatusEnum.initializing
        },
        { _id: 1 },
        { session }
      ).lean();
      if (!currentSkill) return;

      await createVersion(
        {
          versionId,
          skillId,
          tmbId,
          version: 0,
          versionName: 'Initial creation',
          storage,
          runtimeSkills: validatedPackage.runtimeSkills,
          contentHash: validatedPackage.contentHash
        },
        session
      );
      await setCurrentVersion({
        skillId,
        versionId,
        expectedCurrentVersionId: null,
        session
      });
      await MongoAgentSkills.updateOne(
        { _id: skillId, lastOperationId: operationId },
        { $unset: { error: 1 } },
        { session }
      );
      await finalizeStagedSkillPackage(storage, session);
    });
  } catch (error) {
    await MongoAgentSkills.updateOne(
      { _id: skillId, lastOperationId: operationId, currentVersionId: { $exists: false } },
      {
        $set: {
          creationStatus: AgentSkillCreationStatusEnum.failed,
          error: {
            code: 'skill_initialization_failed',
            message: getErrText(error, 'Skill initialization failed'),
            operationId,
            updatedAt: new Date()
          },
          updateTime: new Date()
        }
      }
    );
    throw error;
  }
}

export const agentSkillInitializeProcessor: Processor<AgentSkillInitializeJobData> = async (job) =>
  initializeAgentSkill(job.data);
