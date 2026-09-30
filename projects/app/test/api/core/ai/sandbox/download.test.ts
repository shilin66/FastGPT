import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Writable } from 'node:stream';
import type createArchive from 'archiver';
import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getClient: vi.fn(),
  archives: [] as createArchive.Archiver[]
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/support/permission/auth/chat', () => ({ authChatCrud: mocks.auth }));
vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  getChatSandboxClient: mocks.getClient
}));
vi.mock('archiver', async () => {
  const actual = await vi.importActual<{ default: typeof createArchive }>('archiver');
  return {
    default: (...args: Parameters<typeof createArchive>) => {
      const archive = actual.default(...args);
      mocks.archives.push(archive);
      return archive;
    }
  };
});

import download from '@/pages/api/core/ai/sandbox/download';

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class DownloadResponse extends Writable {
  readonly headers = new Map<string, string>();
  readonly chunks: Buffer[] = [];
  headersSent = false;

  constructor() {
    super();
    this.on('error', () => {});
  }

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }

  removeHeader(name: string) {
    this.headers.delete(name);
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error) => void) {
    this.headersSent = true;
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

describe('Sandbox directory download stream failures', () => {
  let response: DownloadResponse;
  const request = {
    body: {
      appId: '68ad85a7463006c963799a10',
      chatId: 'preview-chat',
      sandboxId: 'preview-workspace',
      path: '.'
    }
  } as ApiRequestProps;
  const makeProvider = (listDirectory: () => Promise<unknown[]>) => ({
    execute: vi.fn().mockResolvedValue({
      stdout: 'FASTGPT_WORKSPACE_PATH_OK',
      stderr: '',
      exitCode: 0
    }),
    getFileInfo: vi
      .fn()
      .mockResolvedValue(new Map([['/workspace', { path: '/workspace', isDirectory: true }]])),
    listDirectory,
    readFiles: vi.fn()
  });
  const startDownload = (listDirectory: () => Promise<unknown[]>, readFiles = vi.fn()) => {
    mocks.getClient.mockResolvedValue({
      id: 'preview-workspace',
      workspaceRoot: '/workspace',
      provider: { ...makeProvider(listDirectory), readFiles },
      withActivity: async (run: () => Promise<unknown>) => run(),
      ensureAvailable: vi.fn().mockResolvedValue(undefined)
    });
    return Promise.resolve(download(request, response as unknown as NextApiResponse)).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error })
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archives.length = 0;
    mocks.auth.mockResolvedValue({ uid: 'authenticated-user' });
    response = new DownloadResponse();
  });

  afterEach(async () => {
    for (const archive of mocks.archives) {
      archive.removeAllListeners('error');
      archive.on('error', () => {});
      archive.abort();
      archive.destroy();
    }
    response.destroy();
    await nextTurn();
  });

  it('handles an asynchronous archive error through the request instead of throwing outside it', async () => {
    const directory = deferred<unknown[]>();
    const reading = deferred<void>();
    const pending = startDownload(() => {
      reading.resolve();
      return directory.promise;
    });
    let requestResult: { error: unknown } | undefined;
    void pending.then((result) => {
      requestResult = result;
    });
    await reading.promise;
    const archive = mocks.archives[0];
    const failure = new Error('zip compressor failed');
    const escapedError = await new Promise<unknown>((resolve) => {
      setImmediate(() => {
        try {
          archive.emit('error', failure);
          resolve(undefined);
        } catch (error) {
          resolve(error);
        }
      });
    });
    directory.resolve([]);
    await nextTurn();
    expect(escapedError).toBeUndefined();
    expect(requestResult?.error).toBe(failure);
    expect(archive.destroyed || archive.readableEnded).toBe(true);
    if (response.headersSent) {
      expect(response.destroyed || response.writableFinished).toBe(true);
    } else {
      expect(response.headers.has('Content-Type')).toBe(false);
      expect(response.headers.has('Content-Disposition')).toBe(false);
    }
  });

  it('terminates the archive when the sandbox directory provider rejects', async () => {
    const failure = new Error('sandbox directory unavailable');
    const result = await startDownload(async () => {
      throw failure;
    });
    await nextTurn();
    expect(result.error).toBe(failure);
    const archive = mocks.archives[0];
    expect(archive.destroyed || archive.readableEnded).toBe(true);
  });

  it('stops the archive promptly when the download client disconnects during a directory read', async () => {
    const directory = deferred<unknown[]>();
    const reading = deferred<void>();
    const readFiles = vi
      .fn()
      .mockResolvedValue([
        { path: '/workspace/main.py', content: Buffer.from('print(1)'), error: null }
      ]);
    const pending = startDownload(() => {
      reading.resolve();
      return directory.promise;
    }, readFiles);
    await reading.promise;
    const archive = mocks.archives[0];
    response.destroy();
    await nextTurn();
    const archiveStoppedBeforeProviderReturns = archive.destroyed || archive.readableEnded;
    directory.resolve([
      { name: 'main.py', path: '/workspace/main.py', isFile: true, isDirectory: false }
    ]);
    await pending;
    await nextTurn();
    expect(archiveStoppedBeforeProviderReturns).toBe(true);
    expect(readFiles).not.toHaveBeenCalled();
  });

  it('finishes a successful download with a complete ZIP containing the requested file', async () => {
    const readFiles = vi
      .fn()
      .mockResolvedValue([
        { path: '/workspace/main.py', content: Buffer.from('print(1)'), error: null }
      ]);
    const result = await startDownload(
      async () => [
        { name: 'main.py', path: '/workspace/main.py', isFile: true, isDirectory: false }
      ],
      readFiles
    );
    expect(result.error).toBeUndefined();
    expect(response.writableFinished).toBe(true);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    const zip = Buffer.concat(response.chunks.map((chunk) => Uint8Array.from(chunk)));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.includes(Buffer.from('main.py'))).toBe(true);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 12)).toBe(1);
  });
});
