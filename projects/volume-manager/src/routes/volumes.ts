import { Hono } from 'hono';
import {
  SandboxVolumeEnsureRequestSchema,
  SandboxVolumeNameSchema,
  SandboxVolumeInspectResponseSchema
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { VolumeService } from '../services/VolumeService';
import { logInfo } from '../utils/logger';

export function volumeRoutes(service: VolumeService): Hono {
  const app = new Hono();

  app.get('/:claimName', async (c) => {
    const name = SandboxVolumeNameSchema.safeParse(c.req.param('claimName'));
    const mode = c.req.query('mode');
    if (!name.success || (mode !== undefined && mode !== 'claimName')) {
      return c.json({ error: 'Invalid volume claim name or mode' }, 400);
    }
    const result = await service.inspect(name.data);
    return c.json(SandboxVolumeInspectResponseSchema.parse(result));
  });

  // POST /v1/volumes/ensure
  app.post('/ensure', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = SandboxVolumeEnsureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
    }

    const { claimName, storageSize } = parsed.data;
    logInfo(`POST /v1/volumes/ensure claimName=${claimName}`);
    const result = await service.ensure({ claimName, storageSize });
    const status = result.created ? 201 : 200;
    logInfo(`ensure done claimName=${result.claimName} created=${result.created} status=${status}`);
    return c.json(result, status);
  });

  // DELETE /v1/volumes/:claimName
  app.delete('/:claimName', async (c) => {
    const claimName = c.req.param('claimName');
    logInfo(`DELETE /v1/volumes/${claimName}`);
    await service.remove(claimName);
    logInfo(`remove done claimName=${claimName}`);
    return c.body(null, 204);
  });

  return app;
}
