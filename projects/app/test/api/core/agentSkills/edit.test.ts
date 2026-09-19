import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/agentSkills/edit';
import { SandboxProtocolEnum } from '@fastgpt/global/core/agentSkills/constants';
import { createEditDebugSandbox } from '@fastgpt/service/core/agentSkills/sandboxController';

vi.unmock('@fastgpt/service/common/response');
vi.mock('@fastgpt/service/support/permission/agentSkill/auth', () => ({
  authSkill: vi.fn(async () => ({ teamId: 'test-team', tmbId: 'test-member' }))
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxController', () => ({
  createEditDebugSandbox: vi.fn()
}));

const require = createRequire(import.meta.url);
const compression: () => (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => void = require('next/dist/compiled/compression');

describe('Skill editor SSE transport', () => {
  it('delivers progress before completion even when the browser accepts gzip', async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(createEditDebugSandbox).mockImplementationOnce(async ({ skillId, onProgress }) => {
      onProgress?.({ sandboxId: skillId, phase: 'downloadingPackage' });
      await pending;
      onProgress?.({ sandboxId: skillId, phase: 'ready' });
      return {
        sandboxId: skillId,
        providerSandboxId: 'test-provider',
        endpoint: {
          host: 'sandbox.invalid',
          port: 8090,
          protocol: SandboxProtocolEnum.http,
          url: 'http://sandbox.invalid:8090'
        },
        status: { state: 'running' }
      };
    });
    const compress = compression();
    const server = createServer((req, res) => {
      compress(req, res, () => {
        // Next's API resolver also binds write to the response before invoking the handler.
        res.write = res.write.bind(res);
        const apiRequest = Object.assign(req, {
          body: { skillId: '111111111111111111111111' },
          query: {},
          cookies: {}
        });
        void handler(apiRequest as NextApiRequest, res as NextApiResponse);
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test HTTP server did not start');
    const client = request({
      hostname: '127.0.0.1',
      port: address.port,
      method: 'POST',
      headers: { 'Accept-Encoding': 'gzip' }
    });
    let received = '';
    const responsePromise = new Promise<IncomingMessage>((resolve, reject) => {
      client.once('error', reject);
      client.once('response', (response) => {
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          received += chunk;
        });
        resolve(response);
      });
    });
    client.end();
    try {
      const response = await responsePromise;
      expect(response.headers['content-encoding']).toBeUndefined();
      expect(response.headers['cache-control']).toContain('no-transform');
      expect(response.headers['x-accel-buffering']).toBe('no');
      await vi.waitFor(() => expect(received).toContain('"phase":"downloadingPackage"'));
      expect(received).not.toContain('"phase":"ready"');
      const ended = once(response, 'end');
      finish();
      await ended;
      expect(received).toContain('"phase":"ready"');
    } finally {
      finish();
      client.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
