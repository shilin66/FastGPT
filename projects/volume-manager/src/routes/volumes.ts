import { Hono } from 'hono';
import { z } from 'zod';
import type { VolumeService } from '../services/VolumeService';
import { logInfo } from '../utils/logger';

const ensureBodySchema = z.union([
  z.object({ sessionId: z.string() }).strict(),
  z.object({ claimName: z.string() }).strict()
]);

export function volumeRoutes(service: VolumeService): Hono {
  const app = new Hono();

  // POST /v1/volumes/ensure
  app.post('/ensure', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ensureBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400);
    }

    const mode = 'claimName' in parsed.data ? 'claimName' : 'sessionId';
    const target = 'claimName' in parsed.data ? parsed.data.claimName : parsed.data.sessionId;
    logInfo(`POST /v1/volumes/ensure ${mode}=${target}`);
    const result = await service.ensure(target, mode);
    const status = result.created ? 201 : 200;
    logInfo(`ensure done claimName=${result.claimName} created=${result.created} status=${status}`);
    return c.json(result, status);
  });

  // DELETE /v1/volumes/:target
  app.delete('/:target', async (c) => {
    const target = c.req.param('target');
    const mode = c.req.query('mode') ?? 'sessionId';
    if (mode !== 'sessionId' && mode !== 'claimName') {
      return c.json({ error: 'Invalid volume mode' }, 400);
    }
    logInfo(`DELETE /v1/volumes/${target} mode=${mode}`);
    await service.remove(target, mode);
    logInfo(`remove done target=${target}`);
    return c.body(null, 204);
  });

  return app;
}
