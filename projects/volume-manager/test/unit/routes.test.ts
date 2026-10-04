import { describe, expect, it, vi } from 'vitest';
import { volumeRoutes } from '../../src/routes/volumes';
import type { VolumeService } from '../../src/services/VolumeService';

vi.mock('../../src/env', () => ({ env: { VM_LOG_LEVEL: 'none' } }));

const makeApp = () => {
  const service = { ensure: vi.fn(), remove: vi.fn() };
  service.ensure.mockResolvedValue({ claimName: 'omni-123', created: true });
  service.remove.mockResolvedValue(undefined);
  return { app: volumeRoutes(service as unknown as VolumeService), service };
};

describe('volume routes', () => {
  it('creates a claimName volume using its exact name', async () => {
    const { app, service } = makeApp();
    const response = await app.request('/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimName: 'omni-123' })
    });
    expect(response.status).toBe(201);
    expect(service.ensure).toHaveBeenCalledWith('omni-123', 'claimName');
  });

  it('removes a claimName volume using its exact name', async () => {
    const { app, service } = makeApp();
    const response = await app.request('/omni-123?mode=claimName', { method: 'DELETE' });
    expect(response.status).toBe(204);
    expect(service.remove).toHaveBeenCalledWith('omni-123', 'claimName');
  });

  it('keeps the sessionId route for existing clients', async () => {
    const { app, service } = makeApp();
    const response = await app.request('/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'legacy-session' })
    });
    expect(response.status).toBe(201);
    expect(service.ensure).toHaveBeenCalledWith('legacy-session', 'sessionId');
  });

  it('rejects an unknown deletion mode before touching a volume', async () => {
    const { app, service } = makeApp();
    const response = await app.request('/omni-123?mode=unknown', { method: 'DELETE' });
    expect(response.status).toBe(400);
    expect(service.remove).not.toHaveBeenCalled();
  });
});
