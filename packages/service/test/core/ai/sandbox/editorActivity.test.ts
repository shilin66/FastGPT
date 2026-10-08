import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SandboxInstanceSchemaType } from '@fastgpt/service/core/ai/sandbox/type';
const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
  execute: vi.fn(),
  inspect: vi.fn(),
  connect: vi.fn(),
  id: 'physical-a' as string | undefined,
  disconnect: vi.fn()
}));
vi.mock('@fastgpt/service/common/redis', () => ({
  getGlobalRedisConnection: () => ({ eval: mocks.eval })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/sandbox/lease')>()),
  withSandboxReadLease: async (
    _key: string,
    run: (lease: { assertOwned: () => Promise<void> }) => unknown
  ) => run({ assertOwned: async () => {} })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getExistingSandboxClient: () => ({
    provider: {
      get id() {
        return mocks.id;
      },
      inspectExisting: mocks.inspect,
      connectExisting: mocks.connect,
      execute: mocks.execute
    }
  })
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', () => ({
  disconnectFromProviderSandbox: mocks.disconnect
}));
import {
  assertSandboxEditorIdle,
  withSandboxEditorConnection
} from '@fastgpt/service/core/ai/sandbox/editorActivity';

describe('Editor lifecycle protection', () => {
  const instance = {
    provider: 'opensandbox',
    sandboxId: 'workspace-a',
    providerScope: 'scope',
    sourceType: 'appRuntime',
    status: 'running',
    metadata: {
      providerSandboxId: 'physical-a',
      editor: {
        providerSandboxId: 'physical-a',
        providerScope: 'scope',
        generation: 'generation-a'
      }
    }
  } as SandboxInstanceSchemaType;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.eval.mockResolvedValue(0);
    mocks.id = 'physical-a';
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.connect.mockResolvedValue(true);
    mocks.inspect.mockResolvedValue({ id: 'physical-a', status: { state: 'Running' } });
    mocks.execute.mockResolvedValue({ exitCode: 0, stdout: '10 1 10 10 pts/0 S bash\n' });
  });
  it('protects any live editor connection without running a process probe', async () => {
    mocks.eval.mockResolvedValue(2);
    await expect(assertSandboxEditorIdle(instance)).rejects.toThrow('sandbox_editor_terminal_busy');
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it('protects a terminal task after the browser disconnects', async () => {
    mocks.execute.mockResolvedValue({
      exitCode: 0,
      stdout: '10 1 10 11 pts/0 S bash\n11 10 11 11 pts/0 S sleep\n'
    });
    await expect(assertSandboxEditorIdle(instance)).rejects.toThrow('sandbox_editor_terminal_busy');
  });
  it('permits an idle shell and ignores non-TTY infrastructure', async () => {
    mocks.execute.mockResolvedValue({
      exitCode: 0,
      stdout: '10 1 10 10 pts/0 S bash\n20 1 20 -1 ? S node\n'
    });
    await expect(assertSandboxEditorIdle(instance)).resolves.toBeUndefined();
  });
  it('retains an instance when the terminal probe fails', async () => {
    mocks.execute.mockResolvedValue({ exitCode: 1, stdout: '' });
    await expect(assertSandboxEditorIdle(instance)).rejects.toThrow('probe_failed');
  });
  it('does not wake a paused container to perform a probe', async () => {
    mocks.id = undefined;
    mocks.inspect.mockResolvedValue({ id: 'physical-a', status: { state: 'Stopped' } });
    await assertSandboxEditorIdle(instance);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
  it('keeps the busy classification if transport cleanup fails', async () => {
    mocks.execute.mockResolvedValue({
      exitCode: 0,
      stdout: '10 1 10 11 pts/0 S bash\n11 10 11 11 pts/0 S sleep\n'
    });
    mocks.disconnect.mockRejectedValue(new Error('transport failed'));
    await expect(assertSandboxEditorIdle(instance)).rejects.toThrow('sandbox_editor_terminal_busy');
  });
  it('does not register an unauthorized connection', async () => {
    await expect(
      withSandboxEditorConnection(instance, { id: 'connection', mode: 'open' }, async () => {
        throw new Error('revoked');
      })
    ).rejects.toThrow('revoked');
    expect(mocks.eval).not.toHaveBeenCalled();
  });
  it('closes a connection whose activity has expired instead of resurrecting it', async () => {
    await expect(
      withSandboxEditorConnection(
        instance,
        { id: 'connection', mode: 'renew' },
        async () => 'target'
      )
    ).rejects.toThrow('expired');
  });
  it('retains resources when Redis cannot establish activity state', async () => {
    mocks.eval.mockRejectedValue(new Error('redis unavailable'));
    await expect(assertSandboxEditorIdle(instance)).rejects.toThrow();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it('does not wait indefinitely for Redis during a lifecycle decision', async () => {
    vi.useFakeTimers();
    try {
      mocks.eval.mockImplementation(() => new Promise(() => {}));
      const rejection = expect(assertSandboxEditorIdle(instance)).rejects.toThrow('probe_failed');
      await vi.advanceTimersByTimeAsync(4_000);
      await rejection;
      expect(mocks.inspect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
