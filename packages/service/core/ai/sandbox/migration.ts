import { isDeepStrictEqual } from 'node:util';
import { connectionMongo } from '../../../common/mongo';
import { MongoSandboxInstance, sandboxInstanceIndexDefinitions } from './schema';

const collection = MongoSandboxInstance.collection;
type ExistingIndex = Awaited<
  ReturnType<ReturnType<typeof collection.listIndexes>['toArray']>
>[number];
type IndexDefinition = (typeof sandboxInstanceIndexDefinitions)[number];

const legacyIndex: IndexDefinition = {
  key: { appId: 1, chatId: 1 },
  options: {
    name: 'appId_1_chatId_1',
    unique: true,
    partialFilterExpression: {
      appId: { $exists: true },
      chatId: { $exists: true },
      'metadata.sandboxType': { $exists: true }
    }
  }
};
const identityFields = [
  'provider',
  'sourceType',
  'sourceId',
  'runtimeUserId',
  'sessionId'
] as const;
const identityFilter = Object.fromEntries(
  identityFields.map((field) => [field, { $exists: true }])
);

const sameKeyFields = (index: ExistingIndex, definition: IndexDefinition) =>
  isDeepStrictEqual(index.key, definition.key);

const matchesDefinition = (index: ExistingIndex, definition: IndexDefinition) =>
  index.name === definition.options.name &&
  isDeepStrictEqual(Object.entries(index.key), Object.entries(definition.key)) &&
  (index.unique === true) === (definition.options.unique === true) &&
  isDeepStrictEqual(index.partialFilterExpression, definition.options.partialFilterExpression) &&
  Object.keys(index).every((key) =>
    ['v', 'key', 'name', 'ns', 'background', 'unique', 'partialFilterExpression'].includes(key)
  );

const listIndexes = async () => {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (error instanceof connectionMongo.mongo.MongoServerError && error.code === 26) return [];
    throw error;
  }
};

export const assertSandboxRuntimeIndexCompatibility = async ({
  appId,
  chatId,
  sandboxId
}: {
  appId: string;
  chatId: string;
  sandboxId: string;
}): Promise<void> => {
  const indexes = await listIndexes();
  const hasLegacyConstraint = indexes.some(
    (index) => index.unique === true && sameKeyFields(index, legacyIndex)
  );
  if (!hasLegacyConstraint) return;

  const conflict = await collection.findOne(
    {
      appId,
      chatId,
      sandboxId: { $ne: sandboxId },
      'metadata.sandboxType': { $exists: true }
    },
    { projection: { _id: 1 } }
  );
  if (conflict) {
    throw new Error(
      'sandbox_identity_migration_required: legacy app/chat index conflicts with runtime isolation'
    );
  }
};

export const auditSandboxIdentityIndexes = async () => {
  const indexes = await listIndexes();
  const [totalCount, canonicalIdentityCount, duplicateGroups] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments(identityFilter),
    collection
      .aggregate<{
        count: { total: number }[];
        samples: { identity: Record<(typeof identityFields)[number], unknown>; count: number }[];
      }>([
        { $match: identityFilter },
        {
          $group: {
            _id: Object.fromEntries(identityFields.map((field) => [field, `$${field}`])),
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gt: 1 } } },
        {
          $facet: {
            count: [{ $count: 'total' }],
            samples: [{ $limit: 20 }, { $project: { _id: 0, identity: '$_id', count: 1 } }]
          }
        }
      ])
      .toArray()
  ]);
  const knownDefinitions = [...sandboxInstanceIndexDefinitions, legacyIndex];
  return {
    indexes,
    totalCount,
    canonicalIdentityCount,
    legacyIdentityCount: totalCount - canonicalIdentityCount,
    duplicateIdentityCount: duplicateGroups[0]?.count[0]?.total ?? 0,
    duplicateIdentitySamples: duplicateGroups[0]?.samples ?? [],
    legacyIndexNames: indexes
      .filter((index) => matchesDefinition(index, legacyIndex))
      .map(({ name }) => name),
    missingIndexNames: sandboxInstanceIndexDefinitions
      .filter((definition) => !indexes.some((index) => matchesDefinition(index, definition)))
      .map(({ options }) => options.name),
    unknownIndexNames: indexes
      .filter(
        (index) =>
          knownDefinitions.some(
            (definition) =>
              index.name === definition.options.name || sameKeyFields(index, definition)
          ) && !knownDefinitions.some((definition) => matchesDefinition(index, definition))
      )
      .map(({ name }) => name)
  };
};

export const migrateSandboxIdentityIndexes = async ({
  confirmWrite
}: {
  confirmWrite: boolean;
}) => {
  if (confirmWrite !== true) {
    throw new Error('sandbox_identity_migration_confirmation_required');
  }
  const audit = await auditSandboxIdentityIndexes();
  if (audit.unknownIndexNames.length > 0) {
    throw new Error(
      'sandbox_identity_migration_unknown_index: inspect conflicting index definitions before cutover'
    );
  }
  if (audit.duplicateIdentityCount > 0) {
    throw new Error(
      'sandbox_identity_migration_duplicate_identity: resolve canonical identity conflicts before cutover'
    );
  }

  const missingDefinitions = sandboxInstanceIndexDefinitions
    .filter(({ options }) => audit.missingIndexNames.includes(options.name))
    .sort((a, b) => Number(b.key.sourceType === 1) - Number(a.key.sourceType === 1));
  const createdIndexNames: string[] = [];
  for (const { key, options } of missingDefinitions) {
    await collection.createIndex(key, options);
    createdIndexNames.push(options.name);
  }

  // Index DDL is not transactional. Preserve the legacy constraint unless every
  // required replacement is present with exactly the audited definition.
  const verified = await auditSandboxIdentityIndexes();
  if (verified.missingIndexNames.length > 0 || verified.unknownIndexNames.length > 0) {
    throw new Error('sandbox_identity_migration_verification_failed');
  }
  const droppedIndexNames: string[] = [];
  for (const name of verified.legacyIndexNames) {
    await collection.dropIndex(name);
    droppedIndexNames.push(name);
  }
  return {
    ...(await auditSandboxIdentityIndexes()),
    createdIndexNames,
    droppedIndexNames
  };
};
