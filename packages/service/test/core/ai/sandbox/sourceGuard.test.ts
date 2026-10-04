import { beforeEach, describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { assertSandboxSourceActive } from '@fastgpt/service/core/ai/sandbox/sourceGuard';

beforeEach(async () => {
  await MongoApp.deleteMany({});
  await MongoAgentSkills.deleteMany({});
});
describe('sandbox source deletion fence', () => {
  it.each(['appRuntime', 'skillEdit'] as const)(
    'requires an active %s source and matching team before provisioning or restoring',
    async (sourceType) => {
      const model = sourceType === 'appRuntime' ? MongoApp.collection : MongoAgentSkills.collection;
      const _id = new Types.ObjectId(),
        teamId = new Types.ObjectId(),
        tmbId = new Types.ObjectId();
      await model.insertOne({ _id, teamId, tmbId, deleteTime: null });
      const scope = { sourceType, sourceId: String(_id), teamId: String(teamId) };
      expect(await assertSandboxSourceActive(scope)).toEqual({
        teamId: String(teamId),
        ownerTmbId: String(tmbId)
      });
      await expect(
        assertSandboxSourceActive({ ...scope, teamId: String(new Types.ObjectId()) })
      ).rejects.toThrow('sandbox_source_deleted');
      await model.updateOne({ _id }, { $set: { deleteTime: new Date() } });
      await expect(assertSandboxSourceActive(scope)).rejects.toThrow('sandbox_source_deleted');
      await model.deleteOne({ _id });
      await expect(assertSandboxSourceActive(scope)).rejects.toThrow('sandbox_source_deleted');
    }
  );
  it('rejects missing source identity', async () => {
    await expect(assertSandboxSourceActive({})).rejects.toThrow('sandbox_source_identity_missing');
  });
});
