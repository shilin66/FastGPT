import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import { RuntimeSkillResolutionError } from '../../../../../../agentSkills/runtimeResolver';
import {
  SandboxCapacityError,
  SandboxVolumeConfigurationError
} from '../../../../../../ai/sandbox/errors';
import { i18nT } from '../../../../../../../../web/i18n/utils';

export class SandboxUnavailableError extends Error {
  readonly code = 'sandbox_unavailable';
  constructor(
    readonly assistantResponses: AIChatItemValueItemType[] = [],
    cause?: unknown
  ) {
    super(
      cause instanceof SandboxCapacityError ||
        assistantResponses.some(
          ({ sandboxEvent }) => sandboxEvent?.code === 'sandbox_capacity_exceeded'
        )
        ? i18nT('chat:sandbox_capacity_exceeded')
        : cause instanceof SandboxVolumeConfigurationError
          ? `sandbox_unavailable: ${cause.message}`
          : 'sandbox_unavailable'
    );
    this.name = 'SandboxUnavailableError';
    if (!assistantResponses.length) {
      assistantResponses.push({
        sandboxEvent: {
          id: getNanoid(),
          status: 'failed',
          code: cause instanceof SandboxCapacityError ? 'sandbox_capacity_exceeded' : this.code
        }
      });
      getLogger(LogCategories.MODULE.AI.AGENT).error('Agent Sandbox unavailable', {
        code: this.code
      });
    }
  }
}

export const isFatalAgentError = (
  error: unknown
): error is SandboxUnavailableError | RuntimeSkillResolutionError =>
  error instanceof SandboxUnavailableError || error instanceof RuntimeSkillResolutionError;
