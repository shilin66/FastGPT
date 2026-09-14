import { z } from 'zod';
import { SandboxStatusEnum } from '../ai/sandbox/constants';

export const SkillEditWorkspaceSchema = z.object({
  status: z
    .enum([...Object.values(SandboxStatusEnum), 'absent', 'conflict'])
    .meta({ description: '编辑工作区状态' }),
  sandboxId: z.string().optional().meta({ description: '逻辑 Sandbox ID，不含 Provider 凭证' }),
  generation: z
    .string()
    .optional()
    .meta({ description: '工作区重置代次；变化后必须手动重开编辑器' }),
  baseVersionId: z
    .string()
    .nullable()
    .meta({ description: '工作区基线；null 表示尚未建立或历史基线未知' }),
  currentVersionId: z.string().nullable().meta({ description: '当前发布版本' }),
  stale: z
    .boolean()
    .meta({ description: '已有工作区基线未知或不同于当前版本；首次初始化未完成不标记 stale' }),
  lastActiveAt: z.string().optional().meta({ description: '最后活动时间，ISO 8601' }),
  operation: z
    .object({
      id: z.string().meta({ description: '操作 ID，用于并发校验' }),
      type: z.string().meta({ description: '操作类型' }),
      checkpoint: z.string().meta({ description: '持久化检查点' }),
      updatedAt: z.string().meta({ description: '操作更新时间，ISO 8601' }),
      heartbeatAt: z.string().optional().meta({ description: '操作心跳，非安全接管凭证' }),
      errorCode: z.string().optional().meta({ description: '无敏感详情的错误码' }),
      failureDisposition: z
        .enum(['retryable', 'unknown'])
        .optional()
        .meta({ description: '失败可重试性；unknown 禁止自动接管' })
    })
    .optional()
    .meta({ description: '工作区当前操作摘要' }),
  resetAvailable: z
    .boolean()
    .meta({ description: '基础设施是否允许安全重置；调用仍要求 Manage 权限' }),
  resetUnavailableReason: z
    .enum([
      'missing_workspace',
      'identity_conflict',
      'not_persistent',
      'operation_in_progress',
      'recovery_required',
      'unsupported_provider'
    ])
    .optional()
    .meta({ description: '不能安全重置的原因' })
});
export type SkillEditWorkspace = z.infer<typeof SkillEditWorkspaceSchema>;
