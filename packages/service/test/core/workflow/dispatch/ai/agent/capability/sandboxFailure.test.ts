import { describe, expect, it } from 'vitest';
import { CommandExecutionError, ConnectionError } from '@fastgpt-sdk/sandbox-adapter';
import {
  SandboxUnavailableError,
  isFatalAgentError
} from '../../../../../../../core/workflow/dispatch/ai/agent/sub/sandbox/errors';
import { isSandboxInfrastructureError } from '../../../../../../../core/ai/sandbox/errors';

describe('Sandbox infrastructure failure boundary', () => {
  it('recognizes an SDK wrapped transport failure without exposing the command', () => {
    const transport = Object.assign(new Error('private endpoint'), { code: 'ECONNRESET' });
    const error = new CommandExecutionError('private command', 'private command', transport);
    expect(isSandboxInfrastructureError(error)).toBe(true);
    const fatal = new SandboxUnavailableError();
    expect(isFatalAgentError(fatal)).toBe(true);
    expect(fatal.message).toBe('sandbox_unavailable');
    expect(fatal.message).not.toContain('private');
  });

  it('recognizes explicit connection errors', () => {
    expect(isSandboxInfrastructureError(new ConnectionError('unreachable'))).toBe(true);
  });

  it.each([
    new Error('File not found: connection.txt'),
    new Error('Original content not found'),
    new CommandExecutionError('command failed', 'false', 1, '', 'script error'),
    Object.assign(new Error('missing file'), { statusCode: 404 }),
    new Error('Invalid Sandbox workspace path')
  ])('does not classify file/argument/script failures as sandbox offline', (error) => {
    expect(isSandboxInfrastructureError(error)).toBe(false);
    expect(isFatalAgentError(error)).toBe(false);
  });

  it('handles cyclic error causes without recursion or guessing', () => {
    const error = new Error('unknown');
    error.cause = error;
    expect(isSandboxInfrastructureError(error)).toBe(false);
  });
});
