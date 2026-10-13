import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  loadPiMessages,
  PiImageLoadError
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/input';
import { buildPiModel } from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/modelBridge';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { z } from 'zod';

const signing = vi.hoisted(() => vi.fn());
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ createGetChatFileURL: signing })
}));

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4N8AAAAASUVORK5CYII=';
const imageContent = { type: 'image', mimeType: 'image/png', data: png };
const imageMessage = (url: string, key?: string): ChatCompletionMessageParam[] => [
  {
    role: 'user',
    content: [{ type: 'image_url', image_url: { url }, key }]
  }
];
const servers: ReturnType<typeof createServer>[] = [];
const startServer = async (onPayload?: (body: unknown) => void) => {
  const server = createServer((req, res) => {
    if (req.url === '/image.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from(png, 'base64'));
      return;
    }
    if (req.url !== '/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      onPayload?.(JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(
        `data: ${JSON.stringify({
          id: 'image-test',
          choices: [{ index: 0, delta: { content: 'image received' }, finish_reason: 'stop' }]
        })}\n\ndata: [DONE]\n\n`
      );
    });
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return `http://127.0.0.1:${address.port}`;
};

beforeEach(() => {
  signing.mockReset();
  vi.stubEnv('NO_PROXY', '127.0.0.1,localhost');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  global.llmModelMap.delete('pi-image-test');
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        })
    )
  );
});

describe('Pi image input', () => {
  const model = getModel('openai', 'gpt-4o-mini');

  it('loads URL images even when ordinary requests allow direct image URLs', async () => {
    const origin = await startServer();
    vi.stubEnv('MULTIPLE_DATA_TO_BASE64', 'false');

    const messages = await loadPiMessages({ messages: imageMessage(`${origin}/image.png`), model });

    expect(messages).toContainEqual({ role: 'user', content: [imageContent], timestamp: 0 });
  });

  it('resolves relative uploaded image URLs against the request origin', async () => {
    const origin = await startServer();

    const messages = await loadPiMessages({
      messages: imageMessage('/image.png'),
      model,
      requestOrigin: origin
    });

    expect(messages).toContainEqual({ role: 'user', content: [imageContent], timestamp: 0 });
  });

  it('refreshes storage access using the file key when its previous URL has expired', async () => {
    const origin = await startServer();
    signing.mockResolvedValue({ url: `${origin}/image.png` });
    const input = imageMessage(`${origin}/expired.png`, 'chat/pixel.png');

    const messages = await loadPiMessages({ messages: input, model });

    expect(messages).toContainEqual({ role: 'user', content: [imageContent], timestamp: 0 });
    expect(signing).toHaveBeenCalledWith({ key: 'chat/pixel.png', external: false });
    expect(input).toEqual(imageMessage(`${origin}/expired.png`, 'chat/pixel.png'));
  });

  it('reports an image load error when the image URL is unavailable', async () => {
    const origin = await startServer();

    const loading = loadPiMessages({ messages: imageMessage(`${origin}/missing.png`), model });

    await expect(loading).rejects.toBeInstanceOf(PiImageLoadError);
  });

  it('keeps text without downloading images when the model has no image input', async () => {
    const textModel = { ...model, input: ['text'] as const };
    const input: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Task' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.invalid/image.png' },
            key: 'unused'
          }
        ]
      }
    ];

    const messages = await loadPiMessages({
      messages: input,
      model: { ...textModel, input: ['text'] }
    });

    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Task' }], timestamp: 0 }
    ]);
    expect(signing).not.toHaveBeenCalled();
  });

  it.each([
    { vision: true, enabled: true, expected: ['text', 'image'] },
    { vision: false, enabled: true, expected: ['text'] },
    { vision: true, enabled: false, expected: ['text'] }
  ])(
    'declares the supported inputs when vision=$vision and enabled=$enabled',
    ({ vision, enabled, expected }) => {
      global.llmModelMap.set('pi-image-test', { ...getLLMModel('gpt-5'), vision });

      const result = buildPiModel('pi-image-test', enabled, {
        key: 'test-only',
        baseUrl: 'http://localhost/v1'
      });

      expect(result.input).toEqual(expected);
    }
  );

  it('sends the loaded image through the real SDK provider HTTP request', async () => {
    let received: unknown;
    const origin = await startServer((body) => {
      received = body;
    });
    const piModel = { ...model, api: 'openai-completions' as const, baseUrl: origin };
    const messages = await loadPiMessages({
      messages: imageMessage(`${origin}/image.png`),
      model: piModel
    });
    const agent = new Agent({ initialState: { model: piModel }, getApiKey: () => 'test-only' });

    await agent.prompt(messages);

    expect(agent.state.errorMessage).toBeUndefined();
    const payload = z
      .object({ messages: z.array(z.object({ role: z.string(), content: z.unknown() })) })
      .parse(received);
    expect(payload.messages).toContainEqual({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }]
    });
    expect(agent.state.messages.at(-1)).toMatchObject({
      content: [{ type: 'text', text: 'image received' }]
    });
  });
});
