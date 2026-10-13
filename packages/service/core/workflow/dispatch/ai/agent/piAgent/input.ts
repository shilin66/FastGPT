import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { Api, Model } from '@mariozechner/pi-ai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/llm/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getImageBase64 } from '../../../../../../common/file/image/utils';
import { getS3ChatSource } from '../../../../../../common/s3/sources/chat';
import { gptMessagesToPi } from './context';

export class PiImageLoadError extends Error {
  constructor(imageUrl: string, cause: unknown) {
    super(`Cannot load image ${imageUrl}, because ${getErrText(cause)}`);
    this.name = 'PiImageLoadError';
  }
}

export const loadPiMessages = async ({
  messages,
  model,
  requestOrigin
}: {
  readonly messages: ChatCompletionMessageParam[];
  readonly model: Model<Api>;
  readonly requestOrigin?: string;
}): Promise<AgentMessage[]> => {
  const loaded = await Promise.all(
    messages.map(async (message): Promise<ChatCompletionMessageParam> => {
      if (message.role !== 'user' || typeof message.content === 'string') return message;
      const content = await Promise.all(
        message.content.map(async (part): Promise<ChatCompletionContentPart[]> => {
          if (part.type === 'file_url') return [];
          if (part.type !== 'image_url') return [part];
          if (!model.input.includes('image')) return [];
          if (/^data:image\/[^;,]+;base64,/i.test(part.image_url.url)) return [part];

          try {
            const url = part.key
              ? (await getS3ChatSource().createGetChatFileURL({ key: part.key, external: false }))
                  .url
              : requestOrigin && part.image_url.url.startsWith('/')
                ? new URL(part.image_url.url, requestOrigin).toString()
                : part.image_url.url;
            const image = await getImageBase64(url);
            return [{ type: 'image_url', image_url: { url: image.completeBase64 } }];
          } catch (error) {
            throw new PiImageLoadError(part.image_url.url, error);
          }
        })
      );
      return { ...message, content: content.flat() };
    })
  );
  return gptMessagesToPi(loaded, model);
};
