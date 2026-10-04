import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';

const commonJs: typeof import('@fastgpt-sdk/sandbox-adapter') = createRequire(import.meta.url)(
  '@fastgpt-sdk/sandbox-adapter'
);

describe.each([
  { module: 'ESM', Adapter: OpenSandboxAdapter },
  { module: 'CommonJS', Adapter: commonJs.OpenSandboxAdapter }
])('OpenSandbox native file transport ($module)', ({ Adapter }) => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = async () => {
    const bytes = Uint8Array.from({ length: 1024 * 1024 + 7 }, (_, index) => index % 256);
    const requests: URL[] = [];
    const fetchStub: typeof fetch = async (input, options) => {
      const request = new Request(input, options);
      const url = new URL(request.url);
      requests.push(url);
      if (url.pathname.includes('/endpoints/')) {
        return Response.json({ endpoint: 'sandbox.example.test' });
      }
      const path = url.searchParams.get('path');
      if (path?.endsWith('/missing')) {
        return Response.json({ message: 'File not found' }, { status: 404 });
      }
      if (url.pathname === '/files/download') {
        return new Response(path?.endsWith('/empty') ? new Uint8Array() : bytes);
      }
      if (url.pathname === '/files/info' && path) {
        return Response.json({
          [path]: {
            path,
            type: path.endsWith('/dir') ? 'directory' : path.endsWith('/link') ? 'symlink' : 'file',
            size: path.endsWith('/empty') ? 0 : bytes.length,
            mode: path.endsWith('/dir') ? 755 : 644,
            owner: 'sandbox',
            group: 'sandbox',
            created_at: '2026-10-03T00:00:00.123Z',
            modified_at: '2026-10-03T01:00:00.456Z'
          }
        });
      }
      throw new Error(`Unexpected provider request ${request.method} ${url.pathname}`);
    };
    vi.stubGlobal('fetch', fetchStub);
    const adapter = new Adapter(
      { baseUrl: 'http://sandbox.example.test', sessionId: 'native-file-test' },
      { image: { repository: 'test-image' }, skipHealthCheck: true }
    );
    await adapter.connect('existing-provider');
    requests.length = 0;
    return { adapter, bytes, requests };
  };

  it('reads binary files beyond the command output limit in one native request', async () => {
    const { adapter, bytes, requests } = await setup();
    const [result] = await adapter.readFiles(['nested/report.bin']);
    expect(result).toEqual({
      path: '/home/sandbox/nested/report.bin',
      content: bytes,
      error: null
    });
    expect(requests.map((url) => url.pathname)).toEqual(['/files/download']);
  });

  it('isolates file errors and preserves zero-byte successes and result order', async () => {
    const { adapter, bytes } = await setup();
    const results = await adapter.readFiles(['missing', 'empty', '/workspace/report.bin']);
    expect(results.map((result) => result.path)).toEqual([
      '/home/sandbox/missing',
      '/home/sandbox/empty',
      '/workspace/report.bin'
    ]);
    expect(results[0].error).toBeInstanceOf(Error);
    expect(results[0].content).toHaveLength(0);
    expect(results[1]).toMatchObject({ content: new Uint8Array(), error: null });
    expect(results[2]).toMatchObject({ content: bytes, error: null });
  });

  it('preserves exclusive range endpoints through the existing range reader', async () => {
    const { adapter, requests } = await setup();
    const execute = vi.spyOn(adapter, 'execute').mockResolvedValue({
      stdout: Buffer.from([2, 3, 4]).toString('base64'),
      stderr: '',
      exitCode: 0
    });
    const [result] = await adapter.readFiles(['report.bin'], { range: '2-5' });
    expect(result.content).toEqual(new Uint8Array([2, 3, 4]));
    expect(result.error).toBeNull();
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('head -c 3'));
    expect(requests).toHaveLength(0);
  });

  it('maps file kinds, octal permissions, zero size and millisecond timestamps', async () => {
    const { adapter, requests } = await setup();
    const info = await adapter.getFileInfo(['empty', 'dir', 'link']);
    expect(info.get('/home/sandbox/empty')).toMatchObject({
      path: '/home/sandbox/empty',
      size: 0,
      mode: 0o644,
      owner: 'sandbox',
      group: 'sandbox',
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      createdAt: new Date('2026-10-03T00:00:00.123Z'),
      modifiedAt: new Date('2026-10-03T01:00:00.456Z')
    });
    expect(info.get('/home/sandbox/dir')).toMatchObject({ isDirectory: true, mode: 0o755 });
    expect(info.get('/home/sandbox/link')).toMatchObject({ isSymlink: true, isFile: false });
    expect(requests.every((url) => url.pathname === '/files/info')).toBe(true);
  });

  it('keeps available metadata when another requested path does not exist', async () => {
    const { adapter } = await setup();
    const info = await adapter.getFileInfo(['missing', 'empty']);
    expect([...info.keys()]).toEqual(['/home/sandbox/empty']);
    expect(info.get('/home/sandbox/empty')?.size).toBe(0);
  });
});
