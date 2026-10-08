import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  ensure: vi.fn(),
  connect: vi.fn(),
  start: vi.fn(),
  endpoint: vi.fn(),
  prepare: vi.fn(),
  info: vi.fn(),
  disconnect: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getChatSandboxClient: mocks.getClient
}));
vi.mock('@fastgpt/service/core/ai/sandbox/schema', () => ({
  MongoSandboxInstance: { findOne: mocks.find, updateOne: mocks.update }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/editor', () => ({
  ensureSandboxEditor: mocks.start,
  SandboxEditorError: class extends Error {
    constructor(code: string) {
      super(code);
    }
  }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/workspace', () => ({
  prepareSandboxSessionDirectory: mocks.prepare
}));
vi.mock('@fastgpt/service/core/agentSkills/sandboxConfig', () => ({
  getSandboxDefaults: () => ({ targetPort: 44772 }),
  getRuntimeSandboxWorkspaceRoot: () => '/workspace',
  getProviderSandboxEndpoint: mocks.endpoint,
  disconnectFromProviderSandbox: mocks.disconnect
}));
vi.mock('@fastgpt/service/core/ai/sandbox/editorEndpoint', () => ({
  getSandboxEditorEndpoint: mocks.endpoint
}));
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getSandboxProviderScope: () => 'scope-a'
}));
vi.mock('@fastgpt/service/core/ai/sandbox/operation', () => ({
  getInstanceBinding: (doc: object) => doc
}));

import { openChatSandboxEditor } from '@/service/core/sandbox/chatEditor';

describe('Chat editor workspace preparation', () => {
  const scope = {
    appId: '6ac138939da0ff8da831ffd1',
    chatId: 'chat-a',
    userId: 'member-a',
    teamId: 'team-a',
    sandboxId: 'workspace-12345678',
    assertAuthorized: vi.fn().mockResolvedValue(undefined)
  };
  const provider = { provider: 'opensandbox', id: 'provider-new', getInfo: mocks.info };
  const doc = {
    _id: 'row-a',
    provider: 'opensandbox',
    providerScope: 'scope-a',
    sandboxId: scope.sandboxId,
    status: 'running',
    reuseScope: 'user',
    runtimeUserId: 'member-a',
    sourceId: scope.appId,
    teamId: 'team-a',
    metadata: { providerSandboxId: 'provider-new' }
  };

  beforeEach(() => {
    vi.resetAllMocks();
    scope.assertAuthorized.mockResolvedValue(undefined);
    mocks.getClient.mockResolvedValue({
      id: scope.sandboxId,
      provider,
      workspaceRoot: '/workspace/sessions/chat-a',
      ensureAvailable: mocks.ensure,
      connectRunning: mocks.connect,
      withActivity: async (run: () => unknown) => run()
    });
    mocks.find.mockReturnValue({ lean: async () => doc });
    mocks.info.mockResolvedValue({ id: 'provider-new', status: { state: 'Running' } });
    mocks.update.mockResolvedValue({ matchedCount: 1 });
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.endpoint.mockResolvedValue({
      host: 'gateway',
      port: 8090,
      protocol: 'http',
      url: 'http://gateway:8090/sandboxes/provider-new/proxy/44772'
    });
    vi.stubEnv('AGENT_SANDBOX_PROXY_MODE', 'ip-path');
  });

  it('resumes the selected workspace and opens the current chat directory through authenticated proxy', async () => {
    const result = await openChatSandboxEditor(scope);
    const url = new URL(result.entryUrl, 'http://localhost:3000');
    expect(mocks.ensure).toHaveBeenCalledWith('interactive', { preserveBoundRuntime: true });
    expect(mocks.prepare).toHaveBeenCalledWith(
      provider,
      '/workspace',
      '/workspace/sessions/chat-a'
    );
    expect(mocks.start).toHaveBeenCalledWith(provider, '/workspace');
    expect(url.searchParams.get('expectedProviderSandboxId')).toBe('provider-new');
    expect(url.searchParams.get('port')).toBe('8090');
    const next = new URL(url.searchParams.get('next')!, 'http://localhost:3000');
    expect(next.pathname).toBe(`/absproxy/ed-${result.editorGeneration}/8090/proxy/8080/`);
    expect(next.searchParams.get('folder')).toBe('/workspace/sessions/chat-a');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: doc.metadata }),
      expect.objectContaining({
        $set: expect.objectContaining({
          'metadata.editor': expect.objectContaining({
            providerSandboxId: 'provider-new',
            generation: result.editorGeneration
          })
        })
      })
    );
  });

  it('never records an endpoint when the image cannot run the editor', async () => {
    mocks.start.mockRejectedValue(new Error('unsupported editor'));
    await expect(openChatSandboxEditor(scope)).rejects.toThrow('unsupported editor');
    expect(mocks.endpoint).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('gives concurrent first opens the same editor generation', async () => {
    let stored = structuredClone(doc) as typeof doc & {
      metadata: typeof doc.metadata & { editor?: { generation: string } };
    };
    mocks.find.mockImplementation(() => ({ lean: async () => structuredClone(stored) }));
    mocks.update.mockImplementation(async (filter, update) => {
      if (
        'metadata.editor.generation' in filter &&
        (filter['metadata.editor.generation'] ?? undefined) !== stored.metadata.editor?.generation
      )
        return { matchedCount: 0 };
      stored = {
        ...stored,
        metadata: { ...stored.metadata, editor: update.$set['metadata.editor'] }
      };
      return { matchedCount: 1 };
    });
    const [first, second] = await Promise.all([
      openChatSandboxEditor(scope),
      openChatSandboxEditor(scope)
    ]);
    expect(first.editorGeneration).toBe(second.editorGeneration);
    expect(first.editorGeneration).toBe(stored.metadata.editor?.generation);
    expect(first.entryUrl).toBe(second.entryUrl);
  });

  it('uses the connected adapter after ensureAvailable replaces the original handle', async () => {
    const stale = {
      provider: 'opensandbox',
      getInfo: vi.fn().mockRejectedValue(new Error('not initialized'))
    };
    let current: object = stale;
    mocks.ensure.mockImplementation(async () => {
      current = provider;
    });
    mocks.getClient.mockResolvedValue({
      id: scope.sandboxId,
      get provider() {
        return current;
      },
      workspaceRoot: '/workspace/sessions/chat-a',
      ensureAvailable: mocks.ensure,
      connectRunning: mocks.connect,
      withActivity: async (run: () => unknown) => run()
    });
    await expect(openChatSandboxEditor(scope)).resolves.toMatchObject({
      sandboxId: scope.sandboxId
    });
    expect(stale.getInfo).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledWith(provider, '/workspace');
    expect(mocks.disconnect).toHaveBeenCalledWith(provider);
  });

  it('preserves a recovery failure when the adapter was never connected', async () => {
    mocks.getClient.mockResolvedValue({
      provider: { provider: 'opensandbox' },
      ensureAvailable: mocks.ensure
    });
    mocks.ensure.mockRejectedValue(new Error('sandbox_editor_recovery_required'));
    mocks.disconnect.mockRejectedValue(new Error('not initialized'));
    await expect(openChatSandboxEditor(scope)).rejects.toThrow('sandbox_editor_recovery_required');
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it('does not mask startup failures with a transport cleanup failure', async () => {
    mocks.start.mockRejectedValue(new Error('startup failed'));
    mocks.disconnect.mockRejectedValue(new Error('transport close failed'));
    await expect(openChatSandboxEditor(scope)).rejects.toThrow('startup failed');
  });

  it('rejects a replaced instance instead of returning a stale editor URL', async () => {
    mocks.update.mockResolvedValue({ matchedCount: 0 });
    await expect(openChatSandboxEditor(scope)).rejects.toThrow();
  });

  it('does not start an editor on a provider without endpoint support', async () => {
    mocks.getClient.mockResolvedValue({ provider: { provider: 'sealosdevbox' } });
    await expect(openChatSandboxEditor(scope)).rejects.toThrow();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('reports an absent workspace without creating one', async () => {
    mocks.getClient.mockRejectedValue(new Error('Sandbox workspace not found'));
    await expect(openChatSandboxEditor(scope)).rejects.toThrow('sandbox_editor_not_found');
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('reuses the editor generation only for the same physical workspace', async () => {
    const generation = 'b4731c12-a9d1-4b18-806d-56f2f8031b25';
    mocks.find.mockReturnValue({
      lean: async () => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          editor: { generation, providerSandboxId: 'provider-new', providerScope: 'scope-a' }
        }
      })
    });
    expect((await openChatSandboxEditor(scope)).editorGeneration).toBe(generation);
    mocks.find.mockReturnValue({
      lean: async () => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          editor: { generation, providerSandboxId: 'old-provider', providerScope: 'scope-a' }
        }
      })
    });
    expect((await openChatSandboxEditor(scope)).editorGeneration).not.toBe(generation);
  });
});
