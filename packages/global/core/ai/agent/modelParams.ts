import { z } from 'zod';

const protectedFields = new Set([
  'model',
  'messages',
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'stream',
  'stream_options',
  'n',
  'parallel_tool_calls',
  'useVision',
  'requestOrigin',
  'toolCallMode',
  'requestUrl',
  'requestAuth',
  'baseURL',
  'apiKey',
  '__proto__',
  'constructor',
  'prototype'
]);

/** Provider-native request parameters; runtime identity, context and tools remain server-owned. */
export const AgentModelParamsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().optional()
  })
  .catchall(z.json())
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (protectedFields.has(key)) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Reserved model parameter: ${key}` });
      }
    }
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 16384) {
      ctx.addIssue({ code: 'custom', message: 'Model parameters exceed 16 KB' });
    }
  });

export type AgentModelParams = z.infer<typeof AgentModelParamsSchema>;

export const applyAgentModelParams = <T extends object>(
  payload: T,
  config?: AgentModelParams,
  outputLimit = Infinity
): T => {
  if (!config) return payload;
  const { max_tokens, max_completion_tokens, ...params } = AgentModelParamsSchema.parse(config);
  const requestedLimit = max_completion_tokens ?? max_tokens;
  const tokenField = 'max_completion_tokens' in payload ? 'max_completion_tokens' : 'max_tokens';
  const currentLimit =
    'max_completion_tokens' in payload
      ? payload.max_completion_tokens
      : 'max_tokens' in payload
        ? payload.max_tokens
        : undefined;
  return {
    ...payload,
    ...params,
    ...(requestedLimit === undefined
      ? {}
      : {
          [tokenField]: Math.min(
            requestedLimit,
            typeof currentLimit === 'number' ? currentLimit : requestedLimit,
            outputLimit
          )
        })
  };
};
