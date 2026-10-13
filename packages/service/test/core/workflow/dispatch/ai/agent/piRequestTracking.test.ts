import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { createPiRequestTracker } from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/requestTracking';
import { getLLMRequestRecord } from '@fastgpt/service/core/ai/record/controller';
import { applyAgentModelParams } from '@fastgpt/global/core/ai/agent/modelParams';
import { z } from 'zod';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
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

describe('Pi provider request tracking', () => {
  it('stores the actual HTTP payload and streamed response from the installed Pi SDK', async () => {
    let receivedPayload: unknown;
    const server = createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(
          [
            {
              id: 'chatcmpl-pi-test',
              choices: [
                {
                  index: 0,
                  delta: { content: 'done', reasoning_content: 'reasoning' },
                  finish_reason: null
                }
              ]
            },
            {
              id: 'chatcmpl-pi-test',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: {
                prompt_tokens: 120,
                completion_tokens: 20,
                total_tokens: 140,
                prompt_tokens_details: { cached_tokens: 30 }
              }
            }
          ]
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join('') + 'data: [DONE]\n\n'
        );
      });
    });
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing HTTP test server address');
    const tracker = createPiRequestTracker();
    const agent = new Agent({
      initialState: {
        systemPrompt: 'system',
        model: {
          ...getModel('openai', 'gpt-4o-mini'),
          api: 'openai-completions',
          baseUrl: `http://127.0.0.1:${address.port}`
        }
      },
      getApiKey: () => 'test-only',
      onPayload: (payload) => {
        const body = applyAgentModelParams(z.record(z.string(), z.unknown()).parse(payload), {
          temperature: 0.7
        });
        tracker.capturePayload(body);
        return body;
      }
    });
    agent.subscribe(async (event) => {
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        await tracker.saveMessage(event.message);
      }
    });

    await agent.prompt('task');

    expect(agent.state.errorMessage).toBeUndefined();
    expect(tracker.requestIds).toHaveLength(1);
    const record = await getLLMRequestRecord(tracker.requestIds[0]);
    expect(record?.body).toEqual(receivedPayload);
    expect(record?.body.temperature).toBe(0.7);
    expect(record?.response).toMatchObject({
      answerText: 'done',
      reasoningText: 'reasoning',
      responseId: 'chatcmpl-pi-test',
      finish_reason: 'stop',
      usage: { inputTokens: 120, outputTokens: 20 }
    });
    expect(tracker.responseData).toMatchObject({
      inputTokens: 120,
      outputTokens: 20,
      temperature: 0.7,
      finishReason: 'stop',
      reasoningText: 'reasoning',
      contextTotalLen: 3,
      historyPreview: [
        { obj: 'System', value: 'system' },
        { obj: 'Human', value: 'task' },
        { obj: 'AI', value: 'done' }
      ]
    });
  });
});
