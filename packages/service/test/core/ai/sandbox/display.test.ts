import { describe, expect, it } from 'vitest';
import {
  getSandboxDisplayFields,
  getSandboxOwnershipMetadata,
  getSandboxTechnicalName
} from '@fastgpt/service/core/ai/sandbox/display';

describe('sandbox display classification', () => {
  it.each([
    { sourceType: 'skillEdit', expected: { reuseScope: 'source', purpose: 'edit' } },
    {
      sourceType: 'appRuntime',
      reuseScope: 'user',
      sourceChatId: 'chat',
      sessionId: 'chat',
      expected: { reuseScope: 'user', purpose: 'runtime' }
    },
    {
      sourceType: 'appRuntime',
      sourceChatId: 'chat',
      sessionId: 'chat',
      expected: { reuseScope: 'session', purpose: 'chat' }
    },
    {
      sourceType: 'appRuntime',
      sourceChatId: 'chat',
      sessionId: 'debug-chat',
      expected: { reuseScope: 'session', purpose: 'debug' }
    },
    {
      sourceType: 'appRuntime',
      sessionId: 'legacy-session',
      expected: { reuseScope: 'session', purpose: 'unknown' }
    },
    {
      sourceType: 'appRuntime',
      reuseScope: 'session',
      expected: { reuseScope: 'session', purpose: 'unknown' }
    },
    { sourceType: 'appRuntime', expected: { reuseScope: 'unknown', purpose: 'unknown' } }
  ] as const)(
    'classifies $sourceType without guessing missing legacy data',
    ({ expected, ...source }) => {
      expect(getSandboxDisplayFields(source)).toEqual(expected);
    }
  );
});

describe('sandbox technical names', () => {
  it('uses IDs and purpose, independently of multilingual or duplicate display names', () => {
    const chat = getSandboxTechnicalName({
      sourceType: 'appRuntime',
      sourceId: 'agent-123',
      sourceChatId: 'chat-456',
      sessionId: 'chat-456',
      sandboxId: 'workspace-789'
    });
    const debug = getSandboxTechnicalName({
      sourceType: 'appRuntime',
      sourceId: 'agent-123',
      sourceChatId: 'chat-456',
      sessionId: 'debug-session',
      sandboxId: 'workspace-789'
    });
    const skill = getSandboxTechnicalName({
      sourceType: 'skillEdit',
      sourceId: 'skill-123',
      sandboxId: 'workspace-789'
    });
    expect(chat).toMatch(/^agent-[a-f0-9]{8}-chat-[a-f0-9]{8}-[a-f0-9]{16}$/);
    expect(debug).toMatch(/^agent-[a-f0-9]{8}-debug-[a-f0-9]{8}-[a-f0-9]{16}$/);
    expect(skill).toMatch(/^skill-[a-f0-9]{8}-edit-[a-f0-9]{16}$/);
    expect(chat).not.toBe(debug);
    expect(chat.length).toBeLessThanOrEqual(63);
    expect(
      getSandboxTechnicalName({
        sourceType: 'appRuntime',
        sourceId: 'agent-123',
        sourceChatId: 'chat-456',
        sessionId: 'chat-456',
        sandboxId: 'workspace-789'
      })
    ).toBe(chat);
  });

  it('uses Docker metadata labels that stay valid with arbitrary source IDs', () => {
    const metadata = getSandboxOwnershipMetadata({
      sourceType: 'appRuntime',
      sourceId: '中文 Agent',
      sourceChatId: '对话 '.repeat(30),
      sandboxId: 'workspace-789'
    });
    expect(metadata['fastgpt.io/kind']).toBe('agent');
    expect(metadata['omni.io/ref']).toMatch(/^agent-/);
    expect(Object.values(metadata).every((value) => value.length <= 63)).toBe(true);
    expect(
      Object.values(metadata).every((value) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value))
    ).toBe(true);
  });
});
