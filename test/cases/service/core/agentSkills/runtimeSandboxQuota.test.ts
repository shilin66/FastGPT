import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { getUser } from '@test/datas/users';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { createAgentSandbox } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle';
import { createSkillPackage } from '@fastgpt/service/core/agentSkills/zipBuilder';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillSourceEnum,
  SandboxTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { generateSandboxIdentityId } from '@fastgpt/service/core/ai/sandbox/identity';
import { randomUUID } from 'node:crypto';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

const { downloadMock, getClientMock, deploymentMock, quotaEnv, setHeartbeatMock } = vi.hoisted(
  () => ({
    downloadMock: vi.fn(),
    getClientMock: vi.fn(),
    deploymentMock: vi.fn(),
    setHeartbeatMock: vi.fn<(heartbeat?: () => Promise<boolean>) => void>(),
    quotaEnv: { AGENT_SANDBOX_MAX_SESSION_RUNTIME: undefined as number | undefined }
  })
);

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    env: {
      ...original.env,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.example.test:8090',
      get AGENT_SANDBOX_MAX_SESSION_RUNTIME() {
        return quotaEnv.AGENT_SANDBOX_MAX_SESSION_RUNTIME;
      }
    }
  };
});
vi.mock('@fastgpt/service/core/agentSkills/storage', () => ({
  downloadSkillPackage: downloadMock
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getSandboxClient: getClientMock
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxDeployment', () => ({
  deploySandboxSkillPackages: deploymentMock
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', () => ({
  withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<unknown>) =>
    run({ token: randomUUID(), assertOwned: async () => undefined, setHeartbeat: setHeartbeatMock })
}));

describe.each([{ hasSkills: true }, { hasSkills: false }])(
  'Runtime workspace capacity with Skill binding: $hasSkills',
  ({ hasSkills }) => {
    let teamId: string;
    let tmbId: string;
    const appId = new Types.ObjectId().toHexString();
    const runtimeUserId = 'capacity-final-user';
    const skillMd =
      '---\nname: runtime-capacity-test\ndescription: Runtime capacity regression\n---\n';
    const skillPath = '/home/sandbox/workspace/skills/runtime-capacity-test/SKILL.md';
    let skillId: string;
    let sessionId: string;
    let sandboxId: string;
    let previousFeConfigs: typeof global.feConfigs;

    beforeEach(async () => {
      vi.clearAllMocks();
      ({ teamId, tmbId } = await getUser('runtime-capacity-owner'));
      quotaEnv.AGENT_SANDBOX_MAX_SESSION_RUNTIME = undefined;
      previousFeConfigs = global.feConfigs;
      global.feConfigs = { ...global.feConfigs, limit: {} };
      sessionId = new Types.ObjectId().toHexString();
      sandboxId = generateSandboxIdentityId({
        sourceType: 'appRuntime',
        sourceId: appId,
        runtimeUserId,
        sessionId
      });

      const packageBuffer = await createSkillPackage({ name: 'runtime-capacity-test', skillMd });
      downloadMock.mockResolvedValue(packageBuffer);
      const skill = await MongoAgentSkills.create({
        teamId,
        tmbId,
        name: 'runtime-capacity-test',
        source: AgentSkillSourceEnum.personal,
        creationStatus: AgentSkillCreationStatusEnum.ready
      });
      skillId = String(skill._id);
      const version = await MongoAgentSkillsVersion.create({
        skillId,
        tmbId,
        version: 0,
        storage: { bucket: 'private', key: 'runtime-capacity-test.zip', size: packageBuffer.length }
      });
      await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: version._id });
      deploymentMock.mockImplementation(
        async ({ packages }: { packages: { skillId: string }[] }) => ({
          manifest: { schemaVersion: 1, entries: [] },
          deployedSkills:
            packages.length > 0
              ? [
                  {
                    id: packages[0].skillId,
                    name: 'runtime-capacity-test',
                    description: 'Runtime capacity regression',
                    directory: '/home/sandbox/workspace/skills/runtime-capacity-test',
                    skillMdPath: skillPath
                  }
                ]
              : []
        })
      );
      await MongoSandboxInstance.create({
        provider: 'opensandbox',
        sandboxId: new Types.ObjectId().toHexString(),
        status: SandboxStatusEnum.running,
        metadata: { sandboxType: SandboxTypeEnum.sessionRuntime }
      });

      getClientMock.mockImplementation(async ({ sandboxId }: { sandboxId: string }) => {
        await MongoSandboxInstance.updateOne(
          { provider: 'opensandbox', sandboxId },
          {
            $set: {
              status: SandboxStatusEnum.running,
              operation: {
                id: randomUUID(),
                type: 'start',
                checkpoint: 'ready',
                startedAt: new Date(),
                updatedAt: new Date()
              }
            }
          },
          { upsert: true }
        );
        return {
          provider: {
            provider: 'opensandbox',
            getInfo: async () => ({
              id: `provider-${sandboxId}`,
              image: { repository: 'test-image', tag: 'latest' },
              createdAt: new Date(),
              status: { state: 'Running' }
            }),
            writeFiles: async () => undefined,
            execute: async (command: string) => ({
              exitCode: 0,
              stdout: hasSkills && command.startsWith('find ') ? skillPath : '',
              stderr: ''
            }),
            readFiles: async () => [{ path: skillPath, content: skillMd }],
            close: async () => undefined
          },
          delete: async () => MongoSandboxInstance.deleteOne({ sandboxId })
        };
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      global.feConfigs = previousFeConfigs;
      quotaEnv.AGENT_SANDBOX_MAX_SESSION_RUNTIME = undefined;
    });

    it('observes the claimed Runtime deployment during provider wait but not after completion', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const deploy = deploymentMock.getMockImplementation()!;
      deploymentMock.mockImplementationOnce(async (...args) => {
        const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
        expect(before?.operation?.heartbeatAt).toBeInstanceOf(Date);
        const heartbeat = setHeartbeatMock.mock.calls[0]?.[0];
        expect(heartbeat).toBeTypeOf('function');
        if (!heartbeat) throw new Error('Runtime heartbeat was not registered');
        vi.setSystemTime(Date.now() + 10_000);
        expect(await heartbeat()).toBe(true);
        const after = await MongoSandboxInstance.findOne({ sandboxId }).lean();
        expect(after?.operation?.heartbeatAt?.getTime()).toBeGreaterThan(
          before!.operation!.heartbeatAt!.getTime()
        );
        expect(after?.operation?.updatedAt).toEqual(before?.operation?.updatedAt);
        expect(after?.operation?.checkpoint).toBe('deploying');
        return deploy(...args);
      });
      await createAgentSandbox({
        skillIds: hasSkills ? [skillId] : [],
        appId,
        runtimeUserId,
        teamId,
        tmbId,
        sessionId
      });
      const completed = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      const heartbeat = setHeartbeatMock.mock.calls[0]?.[0];
      if (!heartbeat) throw new Error('Runtime heartbeat was not registered');
      vi.setSystemTime(Date.now() + 10_000);
      expect(await heartbeat()).toBe(false);
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toEqual(completed);
    });

    it.each([
      { source: 'frontend config', limit: 0 },
      { source: 'frontend config', limit: 1 },
      { source: 'environment', limit: 0 },
      { source: 'environment', limit: 1 }
    ])('rejects a new workspace at $source quota $limit', async ({ source, limit }) => {
      if (source === 'frontend config') {
        const configuredLimit = { ...global.feConfigs.limit, agentSandboxMaxSessionRuntime: limit };
        global.feConfigs = { ...global.feConfigs, limit: configuredLimit };
      } else {
        quotaEnv.AGENT_SANDBOX_MAX_SESSION_RUNTIME = limit;
      }
      const onProgress = vi.fn();

      await expect(
        createAgentSandbox({
          skillIds: hasSkills ? [skillId] : [],
          appId,
          runtimeUserId,
          teamId,
          tmbId,
          sessionId,
          onProgress
        })
      ).rejects.toThrow(`Active session-runtime sandbox limit reached (1/${limit})`);

      expect(getClientMock).not.toHaveBeenCalled();
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
      expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'failed' }));
    });

    it.each([
      { source: 'unset', limit: undefined },
      { source: 'frontend config', limit: 2 },
      { source: 'environment', limit: 2 }
    ])('creates a workspace with $source quota $limit', async ({ source, limit }) => {
      if (source === 'frontend config') {
        const configuredLimit = { ...global.feConfigs.limit, agentSandboxMaxSessionRuntime: limit };
        global.feConfigs = { ...global.feConfigs, limit: configuredLimit };
      } else if (source === 'environment') {
        quotaEnv.AGENT_SANDBOX_MAX_SESSION_RUNTIME = limit;
      }
      const onProgress = vi.fn();

      const result = await createAgentSandbox({
        skillIds: hasSkills ? [skillId] : [],
        appId,
        runtimeUserId,
        teamId,
        tmbId,
        sessionId,
        onProgress
      });

      expect(result.isReady).toBe(true);
      expect(result.skills.map((skill) => String(skill._id))).toEqual(hasSkills ? [skillId] : []);
      expect(result.deployedSkills.map((skill) => skill.name)).toEqual(
        hasSkills ? ['runtime-capacity-test'] : []
      );
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        chatId: sessionId,
        appId,
        userId: runtimeUserId,
        metadata: { sandboxType: SandboxTypeEnum.sessionRuntime }
      });
      expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready' }));
    });

    it('reuses an existing workspace before checking a zero quota', async () => {
      const params = {
        skillIds: hasSkills ? [skillId] : [],
        appId,
        runtimeUserId,
        teamId,
        tmbId,
        sessionId
      };
      await createAgentSandbox(params);
      const configuredLimit = { ...global.feConfigs.limit, agentSandboxMaxSessionRuntime: 0 };
      global.feConfigs = { ...global.feConfigs, limit: configuredLimit };
      quotaEnv.AGENT_SANDBOX_MAX_SESSION_RUNTIME = 0;
      const onProgress = vi.fn();

      const reused = await createAgentSandbox({ ...params, onProgress });

      expect(reused.isReady).toBe(true);
      expect(reused.sessionId).toBe(sessionId);
      expect(await MongoSandboxInstance.countDocuments({ sandboxId })).toBe(1);
      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: 'ready', isWarmStart: true })
      );
    });

    it('keeps provider labels bounded while retaining all Skill bindings in MongoDB', async () => {
      const requestedSkillIds: string[] = [];
      if (hasSkills) {
        requestedSkillIds.push(skillId);
        for (const suffix of ['second', 'third']) {
          const skill = await MongoAgentSkills.create({
            teamId,
            tmbId,
            name: `runtime-capacity-${suffix}`,
            source: AgentSkillSourceEnum.personal,
            creationStatus: AgentSkillCreationStatusEnum.ready
          });
          const version = await MongoAgentSkillsVersion.create({
            skillId: skill._id,
            tmbId,
            version: 0,
            storage: { bucket: 'private', key: `runtime-${suffix}.zip`, size: 100 }
          });
          await MongoAgentSkills.updateOne({ _id: skill._id }, { currentVersionId: version._id });
          requestedSkillIds.push(String(skill._id));
        }
      }

      await createAgentSandbox({
        skillIds: requestedSkillIds,
        appId,
        runtimeUserId,
        teamId,
        tmbId,
        sessionId
      });

      expect(getClientMock).toHaveBeenCalledWith(
        { sandboxId, appId, userId: runtimeUserId, chatId: sessionId },
        expect.objectContaining({
          createConfig: expect.objectContaining({
            metadata: {
              teamId,
              tmbId,
              sandboxType: SandboxTypeEnum.sessionRuntime,
              sessionId: sandboxId
            }
          })
        })
      );
      const instance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(instance?.metadata?.skillIds?.map(String).sort()).toEqual(requestedSkillIds.sort());
    });

    it('still reports physical provider capacity failures', async () => {
      const capacityError = new Error('Provider capacity exhausted');
      getClientMock.mockRejectedValueOnce(capacityError);

      await expect(
        createAgentSandbox({
          skillIds: hasSkills ? [skillId] : [],
          appId,
          runtimeUserId,
          teamId,
          tmbId,
          sessionId
        })
      ).rejects.toBe(capacityError);
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toBeNull();
    });

    it('uses current requested versions on reuse and clears removed Skill bindings', async () => {
      const params = {
        skillIds: hasSkills ? [skillId] : [],
        appId,
        runtimeUserId,
        teamId,
        tmbId,
        sessionId
      };
      await createAgentSandbox(params);
      const version = await MongoAgentSkillsVersion.create({
        skillId,
        tmbId,
        version: 1,
        storage: { bucket: 'private', key: 'updated.zip', size: 100 }
      });
      await MongoAgentSkills.updateOne({ _id: skillId }, { currentVersionId: version._id });
      await createAgentSandbox(params);
      expect(deploymentMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          packages: hasSkills
            ? [expect.objectContaining({ skillId, versionId: String(version._id) })]
            : []
        })
      );
      await createAgentSandbox({ ...params, skillIds: [] });
      expect(deploymentMock).toHaveBeenLastCalledWith(expect.objectContaining({ packages: [] }));
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        metadata: { skillIds: [] }
      });
    });

    it('preserves a failed deployment workspace and retries its checkpoint', async () => {
      const params = {
        skillIds: hasSkills ? [skillId] : [],
        appId,
        runtimeUserId,
        teamId,
        tmbId,
        sessionId
      };
      deploymentMock.mockRejectedValueOnce(new Error('injected deployment failure'));
      await expect(createAgentSandbox(params)).rejects.toThrow('injected deployment failure');
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'failed',
        operation: {
          type: 'deploy',
          checkpoint: 'deploying',
          error: { code: 'sandbox_deployment_failed' }
        }
      });
      const result = await createAgentSandbox(params);
      expect(result.isReady).toBe(true);
      expect(await MongoSandboxInstance.findOne({ sandboxId }).lean()).toMatchObject({
        status: 'running',
        operation: { type: 'deploy', checkpoint: 'completed' }
      });
    });
  }
);
