import { MongoApp } from '../../app/schema';
import { MongoAgentSkills } from '../../agentSkills/schema';
import type { SandboxInstanceSchemaType } from './type';

export const assertSandboxSourceActive = async (
  scope: Pick<SandboxInstanceSchemaType, 'sourceType' | 'sourceId' | 'teamId'>
) => {
  if (!scope.sourceType || !scope.sourceId) throw new Error('sandbox_source_identity_missing');
  const filter = {
    _id: scope.sourceId,
    deleteTime: null,
    ...(scope.teamId ? { teamId: scope.teamId } : {})
  };
  const source =
    scope.sourceType === 'appRuntime'
      ? await MongoApp.findOne(filter, 'teamId tmbId').lean()
      : await MongoAgentSkills.findOne(filter, 'teamId tmbId').lean();
  if (!source) throw new Error('sandbox_source_deleted');
  return { teamId: String(source.teamId), ownerTmbId: String(source.tmbId) };
};
