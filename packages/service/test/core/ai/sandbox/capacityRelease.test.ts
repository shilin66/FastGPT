import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { getExistingSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import { assertSandboxCapacity } from '@fastgpt/service/core/ai/sandbox/capacity';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxLease: async (_key: string, run: (lease: SandboxLease) => Promise<unknown>) =>
    run({ token: randomUUID(), assertOwned: async () => {}, setHeartbeat: () => {} })
}));
vi.mock('@fastgpt/service/env', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/env')>()),
  env: {
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://sandbox.example.test',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    AGENT_SANDBOX_ENABLE_VOLUME: false
  }
}));

describe('capacity release requires an exact Provider terminal state', () => {
  const sandboxId = 'capacity-release-qa';
  const providerId = 'capacity-provider';
  let targetState: string | null;
  let wrongId: boolean;
  let lookupFails: boolean;
  let requests: { method: string; path: string }[];
  let previousConfig: typeof global.feConfigs;
  beforeEach(() => {
    previousConfig = global.feConfigs;
    global.feConfigs = { ...global.feConfigs, limit: { agentSandboxMaxEditDebug: 1 } };
    targetState = 'Running';
    wrongId = false;
    lookupFails = false;
    requests = [];
    vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      requests.push({ method: request.method, path });
      if (path === '/v1/sandboxes' && request.method === 'GET') {
        return Response.json({
          items: [
            {
              id: providerId,
              metadata: { sessionId: sandboxId },
              status: { state: 'Running' },
              createdAt: '2026-09-13T00:00:00Z'
            }
          ]
        });
      }
      if (path.includes('/endpoints/')) return Response.json({ endpoint: 'sandbox.example.test' });
      if (path === `/v1/sandboxes/${providerId}` && request.method === 'GET') {
        if (lookupFails) return Response.json({ message: 'unavailable' }, { status: 503 });
        if (targetState === null) return Response.json({ message: 'not found' }, { status: 404 });
        return Response.json({
          id: wrongId ? 'another-provider' : providerId,
          metadata: { sessionId: sandboxId },
          status: { state: targetState },
          createdAt: '2026-09-13T00:00:00Z'
        });
      }
      if (request.method === 'DELETE' || path.endsWith('/pause')) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected QA request ${request.method} ${path}`);
    });
  });
  afterEach(() => {
    global.feConfigs = previousConfig;
    vi.unstubAllGlobals();
  });

  const seed = () =>
    MongoSandboxInstance.create({
      sandboxId,
      provider: 'opensandbox',
      sourceType: 'skillEdit',
      sourceId: 'capacity-skill',
      capacityReserved: true,
      status: 'running',
      metadata: { sandboxType: SandboxTypeEnum.editDebug, providerSandboxId: providerId }
    });

  it.each(['Running', 'Pausing', 'Deleting', 'unknown', 'lookup-fails', 'wrong-id'])(
    'does not release a successful pause whose exact state is %s',
    async (state) => {
      const record = await seed();
      targetState = state === 'wrong-id' ? 'Paused' : state;
      lookupFails = state === 'lookup-fails';
      wrongId = state === 'wrong-id';
      await expect(getExistingSandboxClient(record).stop()).rejects.toThrow();
      expect(await MongoSandboxInstance.findById(record._id).lean()).toMatchObject({
        capacityReserved: true,
        operation: { checkpoint: 'provider_stop', failureDisposition: 'unknown' }
      });
      await expect(assertSandboxCapacity(SandboxTypeEnum.editDebug)).rejects.toThrow(
        'sandbox limit reached'
      );
      expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(1);
    }
  );

  it.each(['Paused', null])('releases only after the exact target is %s', async (state) => {
    const record = await seed();
    targetState = state;
    await getExistingSandboxClient(record).stop();
    expect(await MongoSandboxInstance.findById(record._id).lean()).toMatchObject({
      status: 'stopped',
      capacityReserved: false,
      operation: { checkpoint: 'provider_stopped' }
    });
    await assertSandboxCapacity(SandboxTypeEnum.editDebug);
    expect(requests).toContainEqual({ method: 'GET', path: `/v1/sandboxes/${providerId}` });
  });

  it('does not remove the instance or release capacity on accepted but incomplete deletion', async () => {
    const record = await seed();
    await expect(getExistingSandboxClient(record).delete()).rejects.toThrow();
    expect(await MongoSandboxInstance.findById(record._id).lean()).toMatchObject({
      capacityReserved: true,
      operation: { checkpoint: 'provider_delete', failureDisposition: 'unknown' }
    });
    await expect(assertSandboxCapacity(SandboxTypeEnum.editDebug)).rejects.toThrow(
      'sandbox limit reached'
    );
    expect(requests.filter(({ method }) => method === 'DELETE')).toHaveLength(1);
  });

  it('deletes the record only after exact absence', async () => {
    const record = await seed();
    targetState = null;
    await getExistingSandboxClient(record).delete();
    expect(await MongoSandboxInstance.findById(record._id).lean()).toBeNull();
    await assertSandboxCapacity(SandboxTypeEnum.editDebug);
    expect(requests).toContainEqual({ method: 'GET', path: `/v1/sandboxes/${providerId}` });
  });

  it('does not trust a legacy deletion checkpoint to bypass the final-state proof', async () => {
    const record = await seed();
    await MongoSandboxInstance.updateOne(
      { _id: record._id },
      {
        $set: {
          status: 'deleting',
          deleteTime: new Date(),
          operation: {
            id: randomUUID(),
            type: 'delete',
            checkpoint: 'provider_deleted',
            providerSandboxId: providerId,
            startedAt: new Date(),
            updatedAt: new Date(),
            failureDisposition: 'retryable',
            error: { code: 'cleanup_pending', message: 'QA' }
          }
        },
        $unset: { capacityReserved: 1 }
      }
    );
    const current = await MongoSandboxInstance.findById(record._id).orFail().lean();
    await expect(getExistingSandboxClient(current).delete()).rejects.toThrow();
    expect(await MongoSandboxInstance.findById(record._id).lean()).not.toBeNull();
    expect(requests.every(({ method }) => method === 'GET')).toBe(true);
    await expect(assertSandboxCapacity(SandboxTypeEnum.editDebug)).rejects.toThrow(
      'sandbox limit reached'
    );
  });
});
