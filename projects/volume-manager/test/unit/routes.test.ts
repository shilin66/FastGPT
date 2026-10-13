import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { volumeRoutes } from '../../src/routes/volumes';
import { VolumeService } from '../../src/services/VolumeService';

vi.mock('../../src/env', () => ({ env: { VM_LOG_LEVEL: 'none' } }));

const makeApp = () => {
  const driver = { inspect: vi.fn(), ensure: vi.fn(), remove: vi.fn() };
  driver.inspect.mockResolvedValue({ claimName: 'omni-original', exists: false });
  driver.ensure.mockResolvedValue({ claimName: 'omni-original', created: false });
  return { driver, app: new Hono().route('/v1/volumes', volumeRoutes(new VolumeService(driver))) };
};

describe('volume management contract', () => {
  it('reports missing volumes without creating them', async () => {
    const { app, driver } = makeApp();
    const response = await app.request('/v1/volumes/omni-original?mode=claimName');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimName: 'omni-original', exists: false });
    expect(driver.inspect).toHaveBeenCalledWith('omni-original');
    expect(driver.ensure).not.toHaveBeenCalled();
  });

  it('supports the main application claimName ensure request', async () => {
    const { app, driver } = makeApp();
    const response = await app.request('/v1/volumes/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimName: 'omni-original' })
    });
    expect(response.status).toBe(200);
    expect(driver.ensure).toHaveBeenCalledWith({ claimName: 'omni-original' });
  });

  it('rejects invalid names before contacting the driver', async () => {
    const { app, driver } = makeApp();
    const response = await app.request('/v1/volumes/invalid_name');
    expect(response.status).toBe(400);
    expect(driver.inspect).not.toHaveBeenCalled();
  });

  it('rejects an unknown address mode', async () => {
    const { app, driver } = makeApp();
    expect((await app.request('/v1/volumes/omni-original?mode=sessionId')).status).toBe(400);
    expect(driver.inspect).not.toHaveBeenCalled();
  });
});
