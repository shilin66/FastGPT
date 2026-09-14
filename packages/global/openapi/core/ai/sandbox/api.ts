import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';
import {
  SandboxProxyScopeSchema,
  SandboxProxyRenewRequestIdSchema
} from '../../../../core/ai/sandbox/proxy';

export const SandboxProxyAuthQuerySchema = z
  .object({
    sandboxId: SandboxProxyScopeSchema.shape.sandboxId.describe('Sandbox 逻辑身份'),
    port: z
      .union([z.number(), z.string().regex(/^\d+$/)])
      .transform(Number)
      .pipe(SandboxProxyScopeSchema.shape.targetPort)
      .describe('实例已声明的代理端口'),
    next: z.string().max(4096).optional().describe('仅允许该 Sandbox 独立 origin 内的跳转地址'),
    mode: z.literal('renew').optional().describe('重新校验主站身份后无损续期资源会话'),
    expectedWorkspaceGeneration: z
      .union([z.literal('legacy'), z.string().uuid()])
      .optional()
      .describe('编辑器打开时的工作区代次；重置后旧页面不能自动续入新工作区'),
    requestId:
      SandboxProxyRenewRequestIdSchema.optional().describe('主站续期 iframe 的随机请求标识')
  })
  .refine(
    (input) =>
      input.mode === 'renew'
        ? input.requestId !== undefined && input.next === undefined
        : input.requestId === undefined,
    { message: 'Invalid proxy renewal request' }
  );

export const SandboxProxyInternalBodySchema = SandboxProxyScopeSchema.omit({
  audience: true
})
  .extend({
    proxyHost: z.string().min(1).max(253).describe('由受信代理服务器传递的原始请求 Host'),
    ticket: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional()
      .describe('单次 bootstrap 票据'),
    mode: z.literal('renew').optional().describe('仅用于固定资源续期回调，必须携带新票据')
  })
  .refine((input) => input.mode !== 'renew' || input.ticket !== undefined, {
    message: 'Renewal requires a fresh ticket'
  });

export const SandboxProxyInternalResponseSchema = z.object({
  target: z.string().url(),
  session: z.string().optional(),
  appOrigin: z.string().url(),
  expiresAt: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('本次票据兑换实际写入的会话过期时间（Unix 毫秒）')
});

const SandboxBaseSchema = z.object({
  appId: z.string(),
  chatId: z.string(),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});

/**
 * 列出目录 - 请求/响应
 */
export const SandboxListBodySchema = SandboxBaseSchema.extend({
  path: z.string().default('.').describe('目录路径')
});
export type SandboxListBody = z.infer<typeof SandboxListBodySchema>;

export const SandboxFileItemSchema = z.object({
  name: z.string().describe('文件名'),
  path: z.string().describe('完整路径'),
  type: z.enum(['file', 'directory']).describe('文件类型'),
  size: z.number().optional().describe('文件大小(字节数)')
});
export type SandboxFileItem = z.infer<typeof SandboxFileItemSchema>;

export const SandboxListResponseSchema = z.object({
  files: z.array(SandboxFileItemSchema)
});
export type SandboxListResponse = z.infer<typeof SandboxListResponseSchema>;

/**
 * 写入文件 - 请求/响应
 */
export const SandboxWriteBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径'),
  content: z.string().describe('文件内容')
});
export type SandboxWriteBody = z.infer<typeof SandboxWriteBodySchema>;

export const SandboxWriteResponseSchema = z.object({
  success: z.boolean()
});
export type SandboxWriteResponse = z.infer<typeof SandboxWriteResponseSchema>;

/**
 * 读取文件内容 - 请求体（响应为原始文件流）
 */
export const SandboxReadBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径')
});
export type SandboxReadBody = z.infer<typeof SandboxReadBodySchema>;

export const SandboxReadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件内容流' });

/**
 * 下载文件或目录 - 请求体（响应为文件流或 ZIP）
 */
export const SandboxDownloadBodySchema = SandboxBaseSchema.extend({
  path: z.string().optional().default('.').describe('要下载的路径(文件或目录)')
});
export type SandboxDownloadBody = z.input<typeof SandboxDownloadBodySchema>;

export const SandboxDownloadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件流或 ZIP 包' });

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodySchema = SandboxBaseSchema;
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在')
});
export type SandboxCheckExistBody = z.infer<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;

/**
 * 获取 HTML 预览链接 - 请求/响应
 */
export const SandboxGetHtmlPreviewLinkBodySchema = SandboxBaseSchema.extend({
  filePath: z.string().describe('文件路径')
});
export const SandboxGetHtmlPreviewLinkResponseSchema = z.string().describe('HTML 预览链接');
export type SandboxGetHtmlPreviewLinkBody = z.infer<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;
