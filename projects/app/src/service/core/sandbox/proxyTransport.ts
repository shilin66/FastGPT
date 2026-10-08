import { request } from 'undici';
import { Readable } from 'stream';
import { promisify } from 'util';
import { gunzip, inflate, brotliDecompress } from 'zlib';
import type { IncomingMessage } from 'http';

export async function requestSandboxProxy(
  url: string,
  req: IncomingMessage,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const upstream = await request(url, {
    method: req.method as import('undici').Dispatcher.HttpMethod,
    headers,
    signal,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined
  });
  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
  }
  const noBody = req.method === 'HEAD' || [204, 205, 304].includes(upstream.statusCode);
  if (noBody) await upstream.body.dump();
  return new Response(
    noBody ? null : (Readable.toWeb(upstream.body) as ReadableStream<Uint8Array>),
    {
      status: upstream.statusCode,
      headers: responseHeaders
    }
  );
}

export async function readSandboxProxyHtml(response: Response): Promise<string> {
  let bytes: Buffer = Buffer.from(await response.arrayBuffer());
  const encodings = (response.headers.get('content-encoding') ?? '')
    .split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .reverse();
  const options = { maxOutputLength: 10 * 1024 * 1024 };
  for (const encoding of encodings) {
    if (encoding === 'gzip') bytes = await promisify(gunzip)(bytes, options);
    else if (encoding === 'br') bytes = await promisify(brotliDecompress)(bytes, options);
    else if (encoding === 'deflate') bytes = await promisify(inflate)(bytes, options);
    else if (encoding && encoding !== 'identity')
      throw Object.assign(new Error('Unsupported upstream HTML encoding'), { statusCode: 502 });
  }
  return bytes.toString('utf8');
}
