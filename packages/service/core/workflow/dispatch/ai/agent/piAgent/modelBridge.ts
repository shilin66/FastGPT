import { getLLMModel } from '../../../../../ai/model';
import { getAIApi } from '../../../../../ai/config';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';

type Model = import('@mariozechner/pi-ai').Model<'openai-completions'>;

export function buildPiModel(
  modelNameOrId?: string,
  useVision?: boolean,
  userKey?: OpenaiAccountType
): Model {
  const cfg = getLLMModel(modelNameOrId);
  const client = getAIApi({ userKey });
  // requestUrl is the full endpoint (e.g. https://api.deepseek.com/chat/completions).
  // pi-ai's openai-completions provider appends /chat/completions automatically,
  // so we strip it to get baseUrl.
  const rawUrl = !userKey ? cfg?.requestUrl : undefined;
  const baseUrl = rawUrl
    ? new URL(rawUrl, client.baseURL).toString().replace(/\/chat\/completions\/?$/, '')
    : client.baseURL;
  const apiKey = getModelApiKey(modelNameOrId, userKey);

  return {
    id: cfg?.model ?? 'gpt-4o',
    name: cfg?.name ?? cfg?.model ?? 'gpt-4o',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl,
    reasoning: cfg?.reasoning ?? false,
    input: useVision ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: cfg?.maxContext ?? 128000,
    maxTokens: Math.min(cfg?.maxResponse ?? 4096, (cfg?.maxContext ?? 128000) - 2048),
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    // Most non-OpenAI endpoints don't support the "developer" role or "store" field.
    // Use "max_tokens" instead of OpenAI-specific "max_completion_tokens" for wider
    // compatibility with vLLM and other OpenAI-compatible servers.
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      maxTokensField: 'max_tokens'
    }
  };
}

export function getModelApiKey(modelNameOrId?: string, userKey?: OpenaiAccountType): string {
  const cfg = getLLMModel(modelNameOrId);
  return (!userKey && cfg?.requestAuth) || getAIApi({ userKey }).apiKey;
}
