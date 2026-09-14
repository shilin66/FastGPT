import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '../../../../core/ai/sandbox/schema';
import {
  assertSandboxRuntimeIndexCompatibility,
  auditSandboxIdentityIndexes,
  migrateSandboxIdentityIndexes
} from '../../../../core/ai/sandbox/migration';

const legacyIndexName = 'appId_1_chatId_1';
const canonicalIndexName = 'provider_1_sourceType_1_sourceId_1_runtimeUserId_1_sessionId_1';
const collection = MongoSandboxInstance.collection;
const createLegacyIndex = () =>
  collection.createIndex(
    { appId: 1, chatId: 1 },
    {
      name: legacyIndexName,
      unique: true,
      partialFilterExpression: {
        appId: { $exists: true },
        chatId: { $exists: true },
        'metadata.sandboxType': { $exists: true }
      }
    }
  );
const canonicalRecord = (sandboxId: string) => ({
  sandboxId,
  provider: 'opensandbox',
  sourceType: 'appRuntime',
  sourceId: 'app-a',
  runtimeUserId: 'user-a',
  sessionId: 'chat-a'
});

describe('Sandbox identity index migration', () => {
  beforeEach(createLegacyIndex);

  it('blocks a different sandbox sharing a legacy app/chat unique key', async () => {
    await collection.insertOne({
      appId: 'app-a',
      chatId: 'chat-a',
      sandboxId: 'another-user',
      metadata: { sandboxType: 'sessionRuntime' }
    });
    await expect(
      assertSandboxRuntimeIndexCompatibility({
        appId: 'app-a',
        chatId: 'chat-a',
        sandboxId: 'new-user'
      })
    ).rejects.toThrow('sandbox_identity_migration_required');
  });

  it('allows the same sandbox and unrelated app/chat identities', async () => {
    await collection.insertOne({
      appId: 'app-a',
      chatId: 'chat-a',
      sandboxId: 'existing',
      metadata: { sandboxType: 'sessionRuntime' }
    });
    for (const identity of [
      { appId: 'app-a', chatId: 'chat-a', sandboxId: 'existing' },
      { appId: 'app-b', chatId: 'chat-a', sandboxId: 'new' },
      { appId: 'app-a', chatId: 'chat-b', sandboxId: 'new' }
    ]) {
      await expect(assertSandboxRuntimeIndexCompatibility(identity)).resolves.toBeUndefined();
    }
  });

  it('does not mistake a generic legacy VM outside the partial filter for a conflict', async () => {
    await collection.insertOne({ appId: 'app-a', chatId: 'chat-a', sandboxId: 'generic' });
    await expect(
      assertSandboxRuntimeIndexCompatibility({
        appId: 'app-a',
        chatId: 'chat-a',
        sandboxId: 'new'
      })
    ).resolves.toBeUndefined();
  });

  it('stops blocking after the exact legacy index has been removed', async () => {
    await collection.insertOne({
      appId: 'app-a',
      chatId: 'chat-a',
      sandboxId: 'another-user',
      metadata: { sandboxType: 'sessionRuntime' }
    });
    await collection.dropIndex(legacyIndexName);
    await expect(
      assertSandboxRuntimeIndexCompatibility({
        appId: 'app-a',
        chatId: 'chat-a',
        sandboxId: 'new-user'
      })
    ).resolves.toBeUndefined();
  });

  it('audits duplicate canonical identities and legacy rows without any writes', async () => {
    await collection.insertMany([
      canonicalRecord('canonical-a'),
      canonicalRecord('canonical-b'),
      { provider: 'opensandbox', sandboxId: 'legacy' },
      { provider: 'opensandbox', sandboxId: 'partial', sourceType: 'skillEdit' }
    ]);
    const indexes = await collection.listIndexes().toArray();
    const records = await collection.find({}).toArray();
    const audit = await auditSandboxIdentityIndexes();

    expect(audit).toMatchObject({
      totalCount: 4,
      canonicalIdentityCount: 2,
      legacyIdentityCount: 2,
      duplicateIdentityCount: 1,
      legacyIndexNames: [legacyIndexName],
      unknownIndexNames: []
    });
    expect(audit.duplicateIdentitySamples).toEqual([
      { identity: expect.objectContaining({ runtimeUserId: 'user-a' }), count: 2 }
    ]);
    expect(audit.missingIndexNames).toContain(canonicalIndexName);
    expect(await collection.listIndexes().toArray()).toEqual(indexes);
    expect(await collection.find({}).toArray()).toEqual(records);
  });

  it('requires explicit write confirmation before changing any index', async () => {
    const indexes = await collection.listIndexes().toArray();
    await expect(migrateSandboxIdentityIndexes({ confirmWrite: false })).rejects.toThrow(
      'sandbox_identity_migration_confirmation_required'
    );
    expect(await collection.listIndexes().toArray()).toEqual(indexes);
  });

  it('audits the persisted shared Skill Edit identity as canonical without rewriting it', async () => {
    await collection.insertOne({
      provider: 'opensandbox',
      sandboxId: 'edit-a',
      sourceType: 'skillEdit',
      sourceId: 'skill-a',
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug',
      ownerTmbId: 'owner-a'
    });
    const records = await collection.find({}).toArray();
    expect(await auditSandboxIdentityIndexes()).toMatchObject({
      totalCount: 1,
      canonicalIdentityCount: 1,
      legacyIdentityCount: 0,
      duplicateIdentityCount: 0
    });
    expect(await collection.find({}).toArray()).toEqual(records);
  });

  it('enforces one shared Edit identity per provider and Skill independently of editing user', async () => {
    await migrateSandboxIdentityIndexes({ confirmWrite: true });
    const identity = {
      provider: 'opensandbox',
      sourceType: 'skillEdit',
      sourceId: 'skill-a',
      runtimeUserId: 'skillEdit',
      sessionId: 'edit-debug'
    };
    await collection.insertOne({ ...identity, sandboxId: 'edit-a', userId: 'member-a' });
    await expect(
      collection.insertOne({ ...identity, sandboxId: 'edit-b', userId: 'member-b' })
    ).rejects.toThrow('E11000');
    await expect(
      collection.insertOne({ ...identity, sourceId: 'skill-b', sandboxId: 'edit-b' })
    ).resolves.toBeDefined();
  });

  it('creates required indexes, removes only the legacy index, and preserves all rows', async () => {
    await collection.createIndex({ createdAt: 1 }, { name: 'operator_created_at' });
    await collection.insertMany([
      canonicalRecord('canonical-a'),
      { provider: 'opensandbox', sandboxId: 'legacy' }
    ]);
    const records = await collection.find({}).toArray();
    const result = await migrateSandboxIdentityIndexes({ confirmWrite: true });

    expect(result.droppedIndexNames).toEqual([legacyIndexName]);
    expect(result.createdIndexNames).toContain(canonicalIndexName);
    expect(result.missingIndexNames).toEqual([]);
    expect(result.indexes.map(({ name }) => name)).toContain('operator_created_at');
    expect(result.indexes.map(({ name }) => name)).toContain('provider_1_sandboxId_1');
    expect(result.indexes.map(({ name }) => name)).toContain(
      'provider_1_appId_1_userId_1_chatId_1'
    );
    expect(await collection.find({}).toArray()).toEqual(records);
    await expect(collection.insertOne(canonicalRecord('canonical-b'))).rejects.toThrow('E11000');
    await expect(
      collection.insertOne({ ...canonicalRecord('canonical-b'), runtimeUserId: 'user-b' })
    ).resolves.toBeDefined();
    const secondRun = await migrateSandboxIdentityIndexes({ confirmWrite: true });
    expect(secondRun.createdIndexNames).toEqual([]);
    expect(secondRun.droppedIndexNames).toEqual([]);
  });

  it('retains valid new identities when the legacy unique index cannot be restored', async () => {
    await migrateSandboxIdentityIndexes({ confirmWrite: true });
    await collection.insertMany(
      ['user-a', 'user-b'].map((runtimeUserId) => ({
        ...canonicalRecord(`canonical-${runtimeUserId}`),
        runtimeUserId,
        appId: 'app-a',
        userId: runtimeUserId,
        chatId: 'chat-a',
        metadata: { sandboxType: 'session-runtime' }
      }))
    );
    const records = await collection.find({}).toArray();
    await expect(createLegacyIndex()).rejects.toThrow('E11000');
    expect(await collection.find({}).toArray()).toEqual(records);
    expect((await collection.listIndexes().toArray()).map((index) => index.name)).toContain(
      canonicalIndexName
    );
  });

  it('retains the legacy index when duplicate canonical identities prevent migration', async () => {
    await collection.insertMany([canonicalRecord('canonical-a'), canonicalRecord('canonical-b')]);
    const indexes = await collection.listIndexes().toArray();
    await expect(migrateSandboxIdentityIndexes({ confirmWrite: true })).rejects.toThrow(
      'sandbox_identity_migration_duplicate_identity'
    );
    expect(await collection.listIndexes().toArray()).toEqual(indexes);
  });

  it('rejects unknown legacy index options instead of deleting a similar index', async () => {
    await collection.dropIndex(legacyIndexName);
    await collection.createIndex({ appId: 1, chatId: 1 }, { name: legacyIndexName, unique: true });
    const indexes = await collection.listIndexes().toArray();
    await expect(migrateSandboxIdentityIndexes({ confirmWrite: true })).rejects.toThrow(
      'sandbox_identity_migration_unknown_index'
    );
    expect(await collection.listIndexes().toArray()).toEqual(indexes);
  });

  it('rejects a conflicting canonical index name without changing indexes', async () => {
    await collection.createIndex({ sourceId: 1 }, { name: canonicalIndexName });
    const indexes = await collection.listIndexes().toArray();
    await expect(migrateSandboxIdentityIndexes({ confirmWrite: true })).rejects.toThrow(
      'sandbox_identity_migration_unknown_index'
    );
    expect(await collection.listIndexes().toArray()).toEqual(indexes);
  });

  it('does not delete legacy constraints if creation of another required index fails', async () => {
    await collection.insertMany([
      { provider: 'opensandbox', sandboxId: 'legacy-duplicate' },
      { provider: 'opensandbox', sandboxId: 'legacy-duplicate' }
    ]);
    await expect(migrateSandboxIdentityIndexes({ confirmWrite: true })).rejects.toThrow('E11000');
    expect((await collection.listIndexes().toArray()).map(({ name }) => name)).toContain(
      legacyIndexName
    );
  });

  it('audits a new database without creating a collection and migrates all required indexes explicitly', async () => {
    await collection.drop();
    expect(await auditSandboxIdentityIndexes()).toMatchObject({
      indexes: [],
      totalCount: 0,
      canonicalIdentityCount: 0,
      legacyIdentityCount: 0,
      duplicateIdentityCount: 0
    });
    await expect(collection.listIndexes().toArray()).rejects.toThrow();
    const result = await migrateSandboxIdentityIndexes({ confirmWrite: true });
    expect(result.createdIndexNames).toHaveLength(7);
    expect(result.createdIndexNames).toContain('provider_1_sourceType_1_workspaceGeneration_1');
    const aliasIndex = (await collection.listIndexes().toArray()).find(
      ({ name }) => name === 'provider_1_sourceType_1_workspaceGeneration_1'
    );
    expect(aliasIndex?.key).toEqual({ provider: 1, sourceType: 1, workspaceGeneration: 1 });
    expect(aliasIndex?.unique).not.toBe(true);
    expect(result.missingIndexNames).toEqual([]);
    expect(result.droppedIndexNames).toEqual([]);
  });
});

describe('Sandbox explicit index management', () => {
  it('disables automatic index creation on the sandbox schema', () => {
    expect(MongoSandboxInstance.schema.get('autoIndex')).toBe(false);
  });

  it('does not implicitly create a collection merely by loading the schema for a dry run', () => {
    expect(MongoSandboxInstance.schema.get('autoCreate')).toBe(false);
  });

  it('respects autoIndex:false while retaining automatic sync for default models', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MONGODB_URI', 'mongodb://unused.test/index-guard');
    vi.resetModules();
    const { connectionMongo, getMongoModel } = await import('../../../../common/mongo');
    const sync = vi.spyOn(connectionMongo.Model, 'syncIndexes').mockResolvedValue([]);
    try {
      getMongoModel(
        'sandbox_explicit_index_probe',
        new connectionMongo.Schema({ value: String }, { autoIndex: false })
      );
      expect(sync).not.toHaveBeenCalled();
      getMongoModel('sandbox_default_index_probe', new connectionMongo.Schema({ value: String }));
      expect(sync).toHaveBeenCalledOnce();
    } finally {
      sync.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
