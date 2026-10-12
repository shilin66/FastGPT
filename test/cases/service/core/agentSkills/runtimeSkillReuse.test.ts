import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { Types } from '@fastgpt/service/common/mongo';
import { getUser } from '@test/datas/users';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { generateSandboxIdentityId } from '@fastgpt/service/core/ai/sandbox/identity';
import * as runtimeResolver from '@fastgpt/service/core/agentSkills/runtimeResolver';
import * as sandboxIdentity from '@fastgpt/service/core/ai/sandbox/identity';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { validateAndNormalizeSkillPackage } from '@fastgpt/service/core/agentSkills/packageValidator';
import { createAgentSandbox } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle';
import { createSandboxSkillsCapability } from '@fastgpt/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills';
import { SandboxTypeEnum, AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';
import {
  archiveWorkspaceScript,
  restoreWorkspaceScript
} from '@fastgpt/service/core/ai/sandbox/archiveIO';

const mocks = vi.hoisted(() => ({
  root: '',
  client: vi.fn(),
  info: vi.fn(),
  download: vi.fn<(args: { storageInfo: { key: string } }) => Promise<Buffer>>()
}));
vi.mock('@fastgpt/service/env', async (original) => ({
  env: {
    ...(await original<typeof import('@fastgpt/service/env')>()).env,
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_ENABLE_VOLUME: true,
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.test',
    AGENT_SANDBOX_VOLUME_MANAGER_URL: 'http://volume.test',
    get AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH() {
      return mocks.root;
    }
  }
}));
vi.mock('@fastgpt/service/core/agentSkills/storage', () => ({
  downloadSkillPackage: mocks.download
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({ getSandboxClient: mocks.client }));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<unknown>) =>
    run({
      token: randomUUID(),
      isActive: () => true,
      assertOwned: async () => undefined,
      setHeartbeat: () => undefined
    })
}));

const execute = promisify(execFile);

describe('Runtime Skill reuse through Mongo, deployment and prompt preparation', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let providerGeneration: number;
  const packages = new Map<string, Buffer>();
  const markdown = (name: string, description: string) =>
    `---\nname: ${name}\ndescription: ${description}\n---\nInstructions\n`;
  const publish = async (name: string, skillId?: string, version = 0) => {
    const skill = skillId
      ? await MongoAgentSkills.findById(skillId).orFail()
      : await MongoAgentSkills.create({
          name,
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          source: AgentSkillSourceEnum.personal,
          creationStatus: 'ready'
        });
    const buffer = await createSkillPackage({
      name,
      skillMd: markdown(name, `Published ${version}`)
    });
    const validated = await validateAndNormalizeSkillPackage(buffer);
    const key = `${skill._id}/${version}.zip`;
    packages.set(key, buffer);
    const published = await MongoAgentSkillsVersion.create({
      skillId: skill._id,
      tmbId: owner.tmbId,
      version,
      runtimeSkills: validated.runtimeSkills,
      contentHash: validated.contentHash,
      storage: { bucket: 'test', key, size: buffer.length }
    });
    await MongoAgentSkills.updateOne({ _id: skill._id }, { currentVersionId: published._id });
    return { skillId: String(skill._id), versionId: String(published._id), key };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    packages.clear();
    mocks.root = await mkdtemp(join(tmpdir(), 'fastgpt-runtime-reuse-'));
    owner = await getUser('runtime-reuse-owner');
    appId = new Types.ObjectId().toHexString();
    providerGeneration = 1;
    mocks.download.mockImplementation(async ({ storageInfo }) => {
      const buffer = packages.get(storageInfo.key);
      if (!buffer) throw new Error('Missing test package');
      return buffer;
    });
    mocks.client.mockImplementation(async (props: { appId: string; userId: string }) => {
      const identity = {
        sourceType: 'appRuntime' as const,
        sourceId: props.appId,
        runtimeUserId: props.userId,
        reuseScope: 'user' as const
      };
      const sandboxId = generateSandboxIdentityId(identity);
      const providerId = `provider-${providerGeneration}`;
      const existing = await MongoSandboxInstance.findOne({ provider: 'opensandbox', sandboxId });
      if (!existing || existing.status !== 'running')
        await MongoSandboxInstance.updateOne(
          { provider: 'opensandbox', sandboxId },
          {
            $set: {
              ...identity,
              appId: props.appId,
              userId: props.userId,
              status: 'running',
              releasedAt: null,
              operation: {
                id: randomUUID(),
                type: 'start',
                checkpoint: 'ready',
                startedAt: new Date(),
                updatedAt: new Date()
              },
              metadata: {
                sandboxType: SandboxTypeEnum.sessionRuntime,
                workspaceRoot: mocks.root,
                providerSandboxId: providerId
              }
            }
          },
          { upsert: true }
        );
      const connectionInfo = {
        id: providerId,
        image: { repository: 'test' },
        createdAt: new Date()
      };
      mocks.info.mockResolvedValue(connectionInfo);
      return {
        connectionInfo,
        provider: {
          provider: 'opensandbox',
          id: providerId,
          getInfo: mocks.info,
          execute: async (command: string) => {
            const result = await execute('/bin/sh', ['-c', command], {
              maxBuffer: 16 * 1024 * 1024
            });
            return { ...result, exitCode: 0 };
          },
          writeFiles: async (files: Parameters<ISandbox['writeFiles']>[0]) => {
            for (const file of files) {
              if (typeof file.data !== 'string' && !(file.data instanceof Uint8Array))
                throw new Error('Expected package bytes');
              await mkdir(dirname(file.path), { recursive: true });
              await writeFile(file.path, file.data);
            }
            return [];
          },
          close: async () => undefined
        }
      };
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(mocks.root, { recursive: true, force: true });
  });

  it('keeps the completed operation unchanged while resolving skills once per warm conversation', async () => {
    const skill = await publish('demo');
    const params = {
      appId,
      runtimeUserId: 'visitor',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      sessionId: 'first-chat',
      skillIds: [skill.skillId]
    };
    const first = await createAgentSandbox(params);
    const before = await MongoSandboxInstance.findOne({ sandboxId: first.sandboxId }).lean();
    const resolveSkills = vi.spyOn(runtimeResolver, 'resolveRuntimeSkills');
    const resolveIdentity = vi.spyOn(sandboxIdentity, 'resolveAppSandboxIdentity');
    const next = await createSandboxSkillsCapability({
      ...params,
      sessionId: 'second-chat',
      mode: 'sessionRuntime',
      showSkillReferences: false,
      allFilesMap: {}
    });
    await next.prepare?.();
    const after = await MongoSandboxInstance.findOne({ sandboxId: first.sandboxId }).lean();

    expect(after?.status).toBe('running');
    expect(after?.operation).toEqual(before?.operation);
    expect(after?.currentDeploymentHash).toBe(before?.currentDeploymentHash);
    expect(resolveSkills).toHaveBeenCalledTimes(1);
    expect(resolveIdentity).toHaveBeenCalledTimes(2);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(next.systemPrompt).toContain(first.deployedSkills[0].skillMdPath);
    await next.dispose?.();
  });

  it('rejects an uncommitted manifest without replacing the completed operation or Skill files', async () => {
    const skill = await publish('demo');
    const params = {
      appId,
      runtimeUserId: 'visitor',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      sessionId: 'first-chat',
      skillIds: [skill.skillId]
    };
    const first = await createAgentSandbox(params);
    const before = await MongoSandboxInstance.findOne({ sandboxId: first.sandboxId }).lean();
    const skillPath = first.deployedSkills[0].skillMdPath;
    const edited = markdown('demo', 'Agent edited instructions');
    await writeFile(skillPath, edited);
    const manifestPath = join(mocks.root, '.runtime/current/manifest.json');
    const manifest = await readFile(manifestPath, 'utf8');
    const changed = manifest.replace('Published 0', 'Uncommitted metadata');
    expect(changed).not.toBe(manifest);
    await writeFile(manifestPath, changed);
    mocks.download.mockClear();

    await expect(createAgentSandbox(params)).rejects.toThrow('manifest');

    const after = await MongoSandboxInstance.findOne({ sandboxId: first.sandboxId }).lean();
    expect(after?.status).toBe('running');
    expect(after?.operation).toEqual(before?.operation);
    expect(after?.currentDeploymentHash).toBe(before?.currentDeploymentHash);
    expect(await readFile(skillPath, 'utf8')).toBe(edited);
    expect(await readFile(manifestPath, 'utf8')).toBe(changed);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects cached connection info that no longer matches the locked provider binding', async () => {
    const skill = await publish('demo');
    const params = {
      appId,
      runtimeUserId: 'visitor',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      sessionId: 'first-chat',
      skillIds: [skill.skillId]
    };
    const first = await createAgentSandbox(params);
    const before = await MongoSandboxInstance.findOne({ sandboxId: first.sandboxId }).lean();
    await MongoSandboxInstance.updateOne(
      { sandboxId: first.sandboxId },
      { $set: { 'metadata.providerSandboxId': 'replacement-container' } }
    );
    mocks.download.mockClear();

    await expect(createAgentSandbox(params)).rejects.toThrow('provider binding changed');

    const after = await MongoSandboxInstance.findOne({ sandboxId: first.sandboxId }).lean();
    expect(after?.operation).toEqual(before?.operation);
    expect(after?.status).toBe('running');
    expect(after?.metadata?.providerSandboxId).toBe('replacement-container');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('preserves edits, discovers a local Skill before the next model call, and downloads only newly requested versions', async () => {
    const firstSkill = await publish('demo');
    const params = {
      appId,
      runtimeUserId: 'visitor',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      sessionId: 'first-chat',
      skillIds: [firstSkill.skillId]
    };
    const first = await createAgentSandbox(params);
    const originalPath = first.deployedSkills[0].skillMdPath;
    await writeFile(originalPath, markdown('demo', 'Agent edited instructions'));
    await mkdir(join(mocks.root, 'skills/local'), { recursive: true });
    await writeFile(
      join(mocks.root, 'skills/local/SKILL.md'),
      markdown('local', 'Agent created Skill')
    );
    mocks.download.mockClear();
    const progress = vi.fn();
    const next = await createSandboxSkillsCapability({
      ...params,
      sessionId: 'second-chat',
      mode: 'sessionRuntime',
      showSkillReferences: false,
      allFilesMap: {},
      workflowStreamResponse: progress
    });
    await next.prepare?.();
    expect(next.systemPrompt).toContain('Agent edited instructions');
    expect(next.systemPrompt).toContain('Agent created Skill');
    expect(next.systemPrompt).toContain(originalPath);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(progress.mock.calls.some(([event]) => event.data?.phase === 'downloadingPackage')).toBe(
      false
    );
    await next.dispose?.();

    const added = await publish('added');
    const both = { ...params, skillIds: [firstSkill.skillId, added.skillId] };
    await createAgentSandbox(both);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenLastCalledWith(
      expect.objectContaining({ storageInfo: expect.objectContaining({ key: added.key }) })
    );
    expect(await readFile(originalPath, 'utf8')).toContain('Agent edited instructions');

    providerGeneration++;
    await MongoSandboxInstance.updateOne(
      { sandboxId: first.sandboxId },
      { status: 'stopped', releasedAt: new Date() }
    );
    const resumed = await createAgentSandbox(both);
    expect(resumed.providerSandboxId).not.toBe(first.providerSandboxId);
    expect(resumed.deployedSkills.some((skill) => skill.source === 'workspace')).toBe(true);
    expect(mocks.download).toHaveBeenCalledTimes(1);

    const archived = await execute('python3', [
      '-c',
      archiveWorkspaceScript,
      mocks.root,
      '1048576'
    ]);
    const receipt: unknown = JSON.parse(archived.stdout);
    if (
      !receipt ||
      typeof receipt !== 'object' ||
      !('path' in receipt) ||
      typeof receipt.path !== 'string' ||
      !('hash' in receipt) ||
      typeof receipt.hash !== 'string' ||
      !('size' in receipt) ||
      typeof receipt.size !== 'number'
    )
      throw new Error('Invalid archive receipt');
    try {
      await rm(mocks.root, { recursive: true });
      await mkdir(mocks.root);
      await execute('python3', [
        '-c',
        restoreWorkspaceScript,
        JSON.stringify({ root: mocks.root, maximum: 1048576, parts: [receipt.path], ...receipt })
      ]);
      const restored = await createAgentSandbox(both);
      expect(restored.deployedSkills.some((skill) => skill.name === 'local')).toBe(true);
      expect(await readFile(originalPath, 'utf8')).toContain('Agent edited instructions');
      expect(mocks.download).toHaveBeenCalledTimes(1);
    } finally {
      await rm(receipt.path, { force: true });
    }

    await publish('demo', firstSkill.skillId, 1);
    const upgraded = await createAgentSandbox(both);
    expect(
      upgraded.deployedSkills.find((skill) => skill.id === firstSkill.skillId)?.skillMdPath
    ).not.toBe(originalPath);
    const pinned = await createAgentSandbox({
      ...both,
      expectedVersionIds: {
        [firstSkill.skillId]: firstSkill.versionId,
        [added.skillId]: added.versionId
      }
    });
    expect(
      pinned.deployedSkills.find((skill) => skill.id === firstSkill.skillId)?.skillMdPath
    ).toBe(originalPath);
    expect(await readFile(originalPath, 'utf8')).toContain('Agent edited instructions');
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });
});
