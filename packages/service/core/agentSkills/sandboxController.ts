/**
 * Skill Sandbox Controller
 *
 * Provides core business logic for managing skill sandbox instances.
 *
 */

import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { MongoSandboxInstance } from '../ai/sandbox/schema';
import { MongoAgentSkills } from './schema';
import { downloadSkillPackage } from './storage';
import { validateAndNormalizeSkillPackage } from './packageValidator';
import { initializeEditSandboxWorkspace, exportEditSandboxWorkspace } from './sandboxWorkspace';
import { getCurrentVersion } from './version/current';
import {
  getSandboxDefaults,
  getSkillEditWorkspaceRoot,
  disconnectFromProviderSandbox,
  getProviderSandboxEndpoint,
  buildBaseContainerEnv,
  waitForSkillEditorReady
} from './sandboxConfig';
import { getSandboxProviderConfig, validateSandboxConfig } from '../ai/sandbox/config';
import type {
  SandboxInstanceSchemaType,
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkills/type';
import {
  AgentSkillCreationStatusEnum,
  SandboxTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { getSandboxClient, getExistingSandboxClient } from '../ai/sandbox/controller';
import { generateSandboxIdentityId } from '../ai/sandbox/identity';
import { withSandboxLease, type SandboxLease } from '../ai/sandbox/lease';
import { registerSandboxOperationHeartbeat } from '../ai/sandbox/operation';
import { assertSandboxCapacity } from '../ai/sandbox/capacity';
import { getLogger, LogCategories } from '../../common/logger';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

export type CreateEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  image?: SandboxImageConfigType;
  entrypoint?: string; // override default entrypoint for this request
  onProgress?: (status: SandboxStatusItemType) => void; // lifecycle progress callback
};

export type CreateEditDebugSandboxResult = {
  sandboxId: string;
  providerSandboxId: string;
  endpoint: SkillSandboxEndpointType;
  status: {
    state: string;
    message?: string;
  };
};

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

export function shouldRestoreEditWorkspace({
  previousProviderSandboxId,
  currentProviderSandboxId,
  workspaceIsEmpty
}: {
  previousProviderSandboxId?: string;
  currentProviderSandboxId: string;
  workspaceIsEmpty: boolean;
}) {
  return (
    workspaceIsEmpty &&
    (!previousProviderSandboxId || previousProviderSandboxId !== currentProviderSandboxId)
  );
}

async function deployEditPackage({
  sandbox,
  packageBuffer,
  workDirectory,
  skillId,
  versionId,
  contentHash,
  onProgress,
  checkpoint
}: {
  sandbox: ISandbox;
  packageBuffer: Buffer;
  workDirectory: string;
  skillId: string;
  versionId: string;
  contentHash: string;
  onProgress?: (status: SandboxStatusItemType) => void;
  checkpoint: (phase: string) => Promise<unknown>;
}) {
  onProgress?.({ sandboxId: skillId, phase: 'uploadingPackage' });
  await checkpoint('package_upload');
  onProgress?.({ sandboxId: skillId, phase: 'extractingPackage' });
  await initializeEditSandboxWorkspace({
    provider: sandbox,
    workDirectory,
    skillPackage: { skillId, versionId, contentHash, packageBuffer },
    assertActive: async () => {
      await checkpoint('package_extract');
    }
  });
}

/**
 * Create an edit-debug sandbox for a skill
 *
 * Process:
 * Phase 1 - Resolve and validate configuration
 * Phase 2 - Pre-flight checks and resource preparation (auth, package download)
 * Phase 3 - Sandbox operations (create, upload, extract, persist)
 */
export async function createEditDebugSandbox(
  params: CreateEditDebugSandboxParams
): Promise<CreateEditDebugSandboxResult> {
  return withSandboxLease(`skill-edit-init:${params.skillId}`, (lease) =>
    initializeEditDebugSandbox(params, lease)
  );
}

async function initializeEditDebugSandbox(
  params: CreateEditDebugSandboxParams,
  lease: SandboxLease
): Promise<CreateEditDebugSandboxResult> {
  const { skillId, teamId, tmbId, image, entrypoint, onProgress } = params;

  // === Phase 1: Resolve and validate configuration ===
  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  const sandboxImage = image || defaults.defaultImage;

  addLog.info('[Sandbox] Creating edit-debug sandbox', {
    skillId,
    teamId,
    image: sandboxImage
  });

  // === Phase 2: Pre-flight checks and resource preparation ===

  // Verify skill exists and user has permission
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    teamId,
    deleteTime: null
  });

  if (!skill) {
    throw new Error('Skill not found or access denied');
  }
  if (skill.creationStatus !== AgentSkillCreationStatusEnum.ready) {
    throw new Error(`Skill is not ready: ${skill.creationStatus}`);
  }

  const activeVersion = await getCurrentVersion(skillId);

  if (!activeVersion) {
    throw new Error('No active version found for skill');
  }

  // chat ID used for all edit-debug sandbox instances
  const EDIT_DEBUG_CHAT_ID = 'edit-debug';
  const identity = {
    sourceType: 'skillEdit' as const,
    sourceId: skillId,
    teamId,
    ownerTmbId: String(skill.tmbId),
    runtimeUserId: 'skillEdit',
    sessionId: EDIT_DEBUG_CHAT_ID
  };
  const generatedSandboxId = generateSandboxIdentityId(identity);
  let initializationFilter:
    | { sandboxId: string; 'operation.id': string; 'operation.type': string; deleteTime: null }
    | undefined;
  const beginInitialization = async (sandboxId: string) => {
    await lease.assertOwned();
    const readyInstance = await MongoSandboxInstance.findOne({
      provider: providerConfig.provider,
      sandboxId,
      status: SandboxStatusEnum.running,
      deleteTime: null,
      'operation.checkpoint': 'ready',
      'operation.type': { $in: ['start', 'provision'] }
    }).lean();
    if (!readyInstance?.operation) throw new Error('operation_conflict');
    await lease.assertOwned();
    const claimed = await MongoSandboxInstance.updateOne(
      {
        _id: readyInstance._id,
        status: SandboxStatusEnum.running,
        'operation.id': readyInstance.operation.id,
        'operation.checkpoint': 'ready',
        deleteTime: null
      },
      {
        $set: {
          status: SandboxStatusEnum.provisioning,
          'metadata.workspaceRoot': workspaceRoot,
          'operation.type': 'editInitialize',
          'operation.checkpoint': 'workspace_inspect',
          'operation.updatedAt': new Date(),
          'operation.heartbeatAt': new Date()
        }
      }
    );
    if (claimed.matchedCount !== 1) throw new Error('operation_conflict');
    initializationFilter = {
      sandboxId,
      'operation.id': readyInstance.operation.id,
      'operation.type': 'editInitialize',
      deleteTime: null
    };
    registerSandboxOperationHeartbeat(lease, {
      provider: providerConfig.provider,
      sandboxId,
      operationId: readyInstance.operation.id,
      operationType: 'editInitialize'
    });
  };
  const checkpointInitialization = async (
    checkpoint: string,
    fields: Record<string, unknown> = {}
  ) => {
    await lease.assertOwned();
    if (!initializationFilter) throw new Error('operation_conflict');
    const updated = await MongoSandboxInstance.findOneAndUpdate(
      { provider: providerConfig.provider, ...initializationFilter },
      {
        $set: { ...fields, 'operation.checkpoint': checkpoint, 'operation.updatedAt': new Date() }
      },
      { new: true }
    );
    if (!updated) throw new Error('operation_conflict');
    await lease.assertOwned();
    return updated;
  };
  const failInitialization = async () => {
    if (!initializationFilter) return;
    try {
      await lease.assertOwned();
      await MongoSandboxInstance.updateOne(
        { provider: providerConfig.provider, ...initializationFilter },
        {
          $set: {
            status: SandboxStatusEnum.failed,
            'operation.updatedAt': new Date(),
            'operation.error': {
              code: 'sandbox_edit_initialization_failed',
              message: 'Skill Edit initialization did not complete'
            }
          }
        }
      );
    } catch {
      addLog.warn('[Sandbox] Could not persist edit initialization failure');
    }
  };

  // Inspect all candidates before provider filtering: changing providers must not
  // silently replace an existing draft with a newly created workspace.
  const candidates = await MongoSandboxInstance.find({
    $or: [
      { sourceType: 'skillEdit', sourceId: skillId },
      { appId: skillId, chatId: EDIT_DEBUG_CHAT_ID },
      { 'metadata.skillId': skillId, 'metadata.sandboxType': SandboxTypeEnum.editDebug },
      { sandboxId: generatedSandboxId }
    ]
  }).limit(2);
  if (candidates.length > 1) {
    throw new Error('sandbox_identity_migration_required: multiple matching edit workspaces');
  }
  const existingInstance = candidates[0];
  const workspaceRoot = getSkillEditWorkspaceRoot(existingInstance);
  if (existingInstance) {
    const existingMetadata = existingInstance.metadata;
    const canonicalIdentityMatches =
      existingInstance.sourceType === 'skillEdit' &&
      existingInstance.sourceId === skillId &&
      existingInstance.runtimeUserId === 'skillEdit' &&
      existingInstance.sessionId === EDIT_DEBUG_CHAT_ID &&
      String(existingInstance.teamId) === teamId;
    const legacyIdentityMatches =
      !existingInstance.sourceType &&
      existingInstance.appId === skillId &&
      existingInstance.chatId === EDIT_DEBUG_CHAT_ID &&
      existingMetadata?.sandboxType === SandboxTypeEnum.editDebug &&
      existingMetadata?.skillId === skillId &&
      existingMetadata.teamId === teamId;
    if (
      existingInstance.provider !== providerConfig.provider ||
      (!canonicalIdentityMatches && !legacyIdentityMatches) ||
      (existingInstance.teamId && String(existingInstance.teamId) !== teamId) ||
      (existingMetadata?.teamId && existingMetadata.teamId !== teamId) ||
      (existingMetadata?.skillId && existingMetadata.skillId !== skillId) ||
      (existingMetadata?.sandboxType && existingMetadata.sandboxType !== SandboxTypeEnum.editDebug)
    ) {
      throw new Error('sandbox_identity_conflict: edit workspace ownership does not match');
    }
    if (existingInstance.deleteTime || existingInstance.status === SandboxStatusEnum.deleting) {
      throw new Error('sandbox_identity_deleting: edit workspace deletion is in progress');
    }
  }

  if (existingInstance) {
    addLog.info('[Sandbox] Found existing sandbox instance, ensuring running', {
      instanceId: existingInstance._id,
      sandboxId: existingInstance.sandboxId
    });

    try {
      onProgress?.({ sandboxId: skillId, phase: 'creatingContainer' });

      await lease.assertOwned();
      const client = await getSandboxClient(
        { sandboxId: existingInstance.sandboxId },
        {
          identity,
          workspaceRoot,
          createConfig: {
            image: sandboxImage,
            entrypoint: [entrypoint ?? defaults.entrypoint],
            env: buildBaseContainerEnv(existingInstance.sandboxId, workspaceRoot, true),
            metadata: {
              skillId,
              teamId,
              sandboxType: SandboxTypeEnum.editDebug,
              sessionId: existingInstance.sandboxId
            }
          }
        }
      );
      await beginInitialization(existingInstance.sandboxId);

      const sandboxInfo = await client.provider.getInfo();
      if (!sandboxInfo) throw new Error('Failed to get sandbox info after reconnection');

      const previousProviderSandboxId = existingInstance.metadata?.providerSandboxId;
      const initialDeploymentIncomplete =
        existingInstance.sourceType === 'skillEdit' &&
        !existingInstance.baseVersionId &&
        !(existingInstance.metadata && 'storage' in existingInstance.metadata);
      let workspaceIsEmpty = false;
      if (
        initialDeploymentIncomplete ||
        !previousProviderSandboxId ||
        previousProviderSandboxId !== sandboxInfo.id
      ) {
        const quotedDirectory = `'${workspaceRoot.replace(/'/g, `'"'"'`)}'`;
        const workspaceCheck = await client.provider.execute(
          `if [ ! -e ${quotedDirectory} ] && [ ! -L ${quotedDirectory} ]; then :; else find ${quotedDirectory} -mindepth 1 -maxdepth 1 -print -quit; fi`
        );
        if (workspaceCheck.exitCode !== 0) {
          throw new Error('Failed to inspect the edit sandbox workspace');
        }
        workspaceIsEmpty = workspaceCheck.stdout.trim().length === 0;
      }
      if (initialDeploymentIncomplete && !workspaceIsEmpty) {
        throw new Error(
          'sandbox_workspace_initialization_incomplete: existing files require recovery'
        );
      }

      if (
        (initialDeploymentIncomplete && workspaceIsEmpty) ||
        shouldRestoreEditWorkspace({
          previousProviderSandboxId,
          currentProviderSandboxId: sandboxInfo.id,
          workspaceIsEmpty
        })
      ) {
        const downloadedPackage = await downloadSkillPackage({
          storageInfo: activeVersion.storage
        });
        const validatedPackage = await validateAndNormalizeSkillPackage(downloadedPackage);
        await lease.assertOwned();
        await deployEditPackage({
          sandbox: client.provider,
          packageBuffer: validatedPackage.zipBuffer,
          workDirectory: workspaceRoot,
          skillId,
          versionId: String(activeVersion._id),
          contentHash: validatedPackage.contentHash,
          onProgress,
          checkpoint: checkpointInitialization
        });
        await checkpointInitialization('package_ready', {
          baseVersionId: activeVersion._id,
          currentDeploymentHash: validatedPackage.contentHash
        });
      }

      await checkpointInitialization('endpoint_ready');
      const endpointInfo = await getProviderSandboxEndpoint(client.provider, defaults.targetPort);

      await waitForSkillEditorReady(client.provider);

      // Update endpoint and sandbox metadata in DB
      await checkpointInitialization('ready', {
        status: SandboxStatusEnum.running,
        ...identity,
        appId: skillId,
        userId: existingInstance.userId ?? tmbId,
        chatId: EDIT_DEBUG_CHAT_ID,
        'metadata.sandboxType': SandboxTypeEnum.editDebug,
        'metadata.skillId': skillId,
        'metadata.teamId': teamId,
        'metadata.tmbId': existingInstance.metadata?.tmbId ?? tmbId,
        'metadata.sessionId': existingInstance.sandboxId,
        'metadata.endpoint': endpointInfo,
        ...(sandboxInfo?.id && { 'metadata.providerSandboxId': sandboxInfo.id })
      });

      onProgress?.({
        sandboxId: skillId,
        phase: 'ready',
        endpoint: endpointInfo,
        providerSandboxId: existingInstance.sandboxId
      });

      return {
        sandboxId: existingInstance._id.toString(),
        providerSandboxId: existingInstance.sandboxId,
        endpoint: endpointInfo,
        status: { state: 'Running' }
      };
    } catch (error) {
      addLog.error('[Sandbox] Failed to ensure sandbox running', { error });
      await failInitialization();
      throw error;
    }
  }

  // Download package.zip from MinIO and standardize it
  addLog.info('[Sandbox] Downloading package from storage', {
    key: activeVersion.storage.key
  });

  onProgress?.({ sandboxId: skillId, phase: 'downloadingPackage' });
  const packageBuffer = await downloadSkillPackage({
    storageInfo: activeVersion.storage
  });
  const validatedPackage = await validateAndNormalizeSkillPackage(packageBuffer);

  addLog.info('[Sandbox] Package downloaded', { size: packageBuffer.length });

  const standardizedBuffer = validatedPackage.zipBuffer;

  await assertSandboxCapacity(SandboxTypeEnum.editDebug, (message) =>
    onProgress?.({ sandboxId: skillId, phase: 'failed', message })
  );

  // === Phase 3: Sandbox operations ===
  let sandbox: ISandbox | null = null;

  try {
    addLog.info('[Sandbox] Creating sandbox instance', {
      image: sandboxImage
    });

    onProgress?.({ sandboxId: skillId, phase: 'creatingContainer' });
    const sessionId = generatedSandboxId;

    // getSandboxClient handles volumes internally (via getVolumeManagerConfig) and calls
    // provider.ensureRunning() which creates the container when it doesn't exist
    await lease.assertOwned();
    const client = await getSandboxClient(
      { sandboxId: sessionId },
      {
        identity,
        workspaceRoot,
        createConfig: {
          image: sandboxImage,
          entrypoint: [entrypoint ?? defaults.entrypoint],
          env: buildBaseContainerEnv(sessionId, workspaceRoot, true),
          // volumes: handled internally by getSandboxClient via getVolumeManagerConfig
          metadata: {
            skillId,
            teamId,
            sandboxType: SandboxTypeEnum.editDebug,
            sessionId
          }
        }
      }
    );
    sandbox = client.provider;
    await beginInitialization(sessionId);

    const sandboxInfo = await client.provider.getInfo();
    if (!sandboxInfo) throw new Error('Failed to get sandbox info after creation');

    addLog.info('[Sandbox] Uploading package to sandbox');
    await lease.assertOwned();
    await deployEditPackage({
      sandbox: client.provider,
      packageBuffer: standardizedBuffer,
      workDirectory: workspaceRoot,
      skillId,
      versionId: String(activeVersion._id),
      contentHash: validatedPackage.contentHash,
      onProgress,
      checkpoint: checkpointInitialization
    });
    await checkpointInitialization('package_ready', {
      baseVersionId: activeVersion._id,
      currentDeploymentHash: validatedPackage.contentHash,
      'metadata.providerSandboxId': sandboxInfo.id
    });

    addLog.info('[Sandbox] Package extracted successfully');

    // Get endpoint
    addLog.info('[Sandbox] Getting endpoint', { port: defaults.targetPort });
    await checkpointInitialization('endpoint_ready');
    const endpointInfo = await getProviderSandboxEndpoint(client.provider, defaults.targetPort);

    await waitForSkillEditorReady(client.provider);

    addLog.info('[Sandbox] Endpoint obtained', endpointInfo);

    // Enrich the DB record created by getSandboxClient.ensureAvailable() with full skill metadata.
    // Use sessionId (the client-side key) because ensureAvailable() stores the record with
    // sandboxId=sessionId, not with the provider-assigned sandboxInfo.id.
    const newSandboxDoc = await checkpointInitialization('ready', {
      status: SandboxStatusEnum.running,
      ...identity,
      baseVersionId: activeVersion._id,
      currentDeploymentHash: validatedPackage.contentHash,
      appId: skillId,
      userId: tmbId,
      chatId: EDIT_DEBUG_CHAT_ID,
      'metadata.sandboxType': SandboxTypeEnum.editDebug,
      'metadata.teamId': teamId,
      'metadata.tmbId': tmbId,
      'metadata.skillId': skillId,
      'metadata.sessionId': sessionId,
      'metadata.providerSandboxId': sandboxInfo.id,
      'metadata.provider': providerConfig.provider,
      'metadata.image': sandboxInfo.image,
      'metadata.providerCreatedAt': sandboxInfo.createdAt,
      'metadata.endpoint': endpointInfo,
      'metadata.storage': {
        bucket: activeVersion.storage.bucket,
        key: activeVersion.storage.key,
        size: standardizedBuffer.length,
        uploadedAt: new Date()
      },
      'metadata.metadata': new Map([
        ['skillName', skill.name],
        ['version', activeVersion.version.toString()]
      ])
    });

    if (!newSandboxDoc) throw new Error('Failed to find sandbox document after creation');

    addLog.info('[Sandbox] Sandbox info saved to database', {
      sandboxId: newSandboxDoc._id
    });

    onProgress?.({
      sandboxId: skillId,
      phase: 'ready',
      endpoint: endpointInfo,
      providerSandboxId: sessionId
    });

    return {
      sandboxId: newSandboxDoc._id.toString(),
      providerSandboxId: sessionId,
      endpoint: endpointInfo,
      status: {
        state: sandboxInfo.status.state,
        message: sandboxInfo.status.message
      }
    };
  } catch (error) {
    addLog.error('[Sandbox] Failed to create sandbox', {
      error
    });

    await failInitialization();

    throw error;
  } finally {
    if (sandbox) {
      await disconnectFromProviderSandbox(sandbox);
    }
  }
}
export async function getSandboxInfo(
  params: GetSandboxInfoParams
): Promise<SandboxInstanceSchemaType> {
  const { sandboxId, teamId } = params;

  const sandbox = await MongoSandboxInstance.findOne({
    _id: sandboxId,
    'metadata.teamId': teamId
  });

  if (!sandbox) {
    throw new Error('Sandbox not found or access denied');
  }

  return sandbox as unknown as SandboxInstanceSchemaType;
}

/**
 * Delete sandbox
 */
export async function deleteSandbox(params: DeleteSandboxParams): Promise<void> {
  const { sandboxId, teamId } = params;

  const instanceDoc = await MongoSandboxInstance.findOne({
    _id: sandboxId,
    'metadata.teamId': teamId
  });

  if (!instanceDoc || (instanceDoc.teamId && String(instanceDoc.teamId) !== teamId)) {
    throw new Error('Sandbox not found or access denied');
  }

  addLog.info('[Sandbox] Deleting sandbox', { sandboxId });

  const client = getExistingSandboxClient(instanceDoc);
  await client.delete();
}

/**
 * Force delete all sandbox instances related to the given skill IDs
 * Called when a skill is deleted to clean up provider resources
 */
export async function deleteSkillRelatedSandboxes({
  skillIds,
  teamId,
  assertAuthorized
}: {
  skillIds: string[];
  teamId: string;
  assertAuthorized: () => Promise<void>;
}): Promise<void> {
  if (skillIds.length === 0) return;

  const instances = await MongoSandboxInstance.find({
    $or: [
      { sourceType: 'skillEdit', sourceId: { $in: skillIds } },
      {
        sourceType: { $exists: false },
        'metadata.sandboxType': SandboxTypeEnum.editDebug,
        $or: [{ appId: { $in: skillIds } }, { 'metadata.skillId': { $in: skillIds } }]
      }
    ]
  }).lean();

  if (instances.length === 0) return;

  addLog.info('[Sandbox] Force deleting skill-related sandboxes', {
    skillIds,
    count: instances.length
  });

  for (const doc of instances) {
    const canonical =
      doc.sourceType === 'skillEdit' &&
      skillIds.includes(String(doc.sourceId)) &&
      String(doc.teamId) === teamId;
    const legacy =
      !doc.sourceType &&
      doc.metadata?.sandboxType === SandboxTypeEnum.editDebug &&
      doc.appId === doc.metadata?.skillId &&
      skillIds.includes(String(doc.appId)) &&
      doc.chatId === 'edit-debug' &&
      doc.metadata?.teamId === teamId;
    if (
      (!canonical && !legacy) ||
      (doc.teamId && String(doc.teamId) !== teamId) ||
      (doc.metadata?.teamId && doc.metadata.teamId !== teamId) ||
      (doc.sourceType === 'skillEdit' &&
        doc.metadata?.skillId &&
        doc.metadata.skillId !== String(doc.sourceId)) ||
      (doc.metadata?.sandboxType && doc.metadata.sandboxType !== SandboxTypeEnum.editDebug)
    ) {
      throw new Error('skill_deletion_sandbox_identity_conflict');
    }
  }
  for (const doc of instances) {
    await assertAuthorized();
    const client = getExistingSandboxClient(doc);
    await client.delete({ assertAuthorized });
  }
}

export async function packageSkillInSandbox(params: {
  sandboxId: string;
  workDirectory?: string;
  lease?: SandboxLease;
  operationId?: string;
  assertActive?: () => Promise<void>;
}): Promise<Buffer> {
  const { sandboxId, workDirectory } = params;
  const selected = await MongoSandboxInstance.findOne({
    provider: getSandboxProviderConfig().provider,
    sandboxId,
    'metadata.sandboxType': SandboxTypeEnum.editDebug,
    deleteTime: null
  }).lean();
  if (!selected) throw new Error('Edit Sandbox not found');
  const skillId =
    selected.sourceType === 'skillEdit' ? selected.sourceId : selected.metadata?.skillId;
  if (typeof skillId !== 'string' || !/^[a-f0-9]{24}$/.test(skillId)) {
    throw new Error('Invalid Skill Edit identity');
  }
  const exportPackage = async (lease: SandboxLease) => {
    const instance = await MongoSandboxInstance.findOne({
      _id: selected._id,
      provider: selected.provider,
      status: params.operationId ? SandboxStatusEnum.provisioning : SandboxStatusEnum.running,
      ...(params.operationId
        ? { 'operation.id': params.operationId, 'operation.type': 'publish' }
        : {}),
      deleteTime: null
    }).lean();
    if (!instance) throw new Error('Edit Sandbox is not running');
    const canonicalIdentityMatches =
      instance.sourceType === 'skillEdit' &&
      instance.sourceId === skillId &&
      instance.runtimeUserId === 'skillEdit' &&
      instance.sessionId === 'edit-debug' &&
      String(instance.teamId) === instance.metadata?.teamId;
    const legacyIdentityMatches =
      !instance.sourceType &&
      instance.appId === skillId &&
      instance.chatId === 'edit-debug' &&
      instance.metadata?.skillId === skillId &&
      typeof instance.metadata?.teamId === 'string';
    if (
      (!canonicalIdentityMatches && !legacyIdentityMatches) ||
      instance.metadata?.sandboxType !== SandboxTypeEnum.editDebug ||
      (instance.metadata?.skillId && instance.metadata.skillId !== skillId)
    ) {
      throw new Error('Invalid Skill Edit identity');
    }
    const targetDir = getSkillEditWorkspaceRoot(instance);
    if (workDirectory !== undefined && workDirectory !== targetDir) {
      throw new Error('Cannot override the Skill Edit workspace root');
    }
    await lease.assertOwned();
    const sandbox = getExistingSandboxClient(instance).provider;
    try {
      if (
        sandbox.provider !== 'opensandbox' ||
        !('connectExisting' in sandbox) ||
        typeof sandbox.connectExisting !== 'function' ||
        !(await sandbox.connectExisting())
      ) {
        throw new Error('Edit Sandbox is not running');
      }
      const info = await sandbox.getInfo();
      if (info?.status.state !== 'Running') throw new Error('Edit Sandbox is not running');
      return await exportEditSandboxWorkspace({
        provider: sandbox,
        workDirectory: targetDir,
        assertActive: params.assertActive ?? lease.assertOwned
      });
    } finally {
      await disconnectFromProviderSandbox(sandbox);
    }
  };
  return params.lease
    ? exportPackage(params.lease)
    : withSandboxLease(`skill-edit-init:${skillId}`, exportPackage);
}
