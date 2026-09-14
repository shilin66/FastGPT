import { describe, it, expect, vi } from 'vitest';
import { collectSkillReferenceResponses } from '@fastgpt/service/core/workflow/dispatch/ai/agent/capability/sandboxSkills';
import { isSandboxInfrastructureError } from '@fastgpt/service/core/ai/sandbox/errors';
import type { AgentSandboxContext } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/types';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

describe('Sandbox infrastructure classification', () => {
  it.each(['not found', 'not exist', 'connection', 'Permission denied', 'ECONNRESET'])(
    'does not infer infrastructure failure from user-controlled text: %s',
    (message) => {
      expect(isSandboxInfrastructureError(new Error(message))).toBe(false);
    }
  );
  it.each(['SANDBOX_NOT_FOUND', 'ECONNREFUSED', 'ECONNRESET'])(
    'recognizes explicit infrastructure code %s',
    (code) => {
      expect(isSandboxInfrastructureError(Object.assign(new Error('opaque'), { code }))).toBe(true);
    }
  );
  it.each([null, undefined, 'not found', 123])('ignores unstructured values', (value) => {
    expect(isSandboxInfrastructureError(value)).toBe(false);
  });
});

describe('collectSkillReferenceResponses', () => {
  const createMockSandboxContext = (
    deployedSkills: AgentSandboxContext['deployedSkills']
  ): AgentSandboxContext =>
    ({
      deployedSkills,
      workDirectory: '/work',
      providerSandboxId: 'sandbox-123',
      sandboxId: 'logical-123',
      operationId: 'operation-123'
    }) as AgentSandboxContext;

  it('retains the audit without exposing Skill references when showSkillReferences is false', () => {
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'TestSkill',
        description: 'A test skill',
        avatar: '',
        skillMdPath: '/work/skill/SKILL.md',
        directory: '/work/skill'
      }
    ]);

    const result = collectSkillReferenceResponses({
      paths: ['/work/skill/SKILL.md'],
      sandboxContext: context,
      showSkillReferences: false,
      toolCallId: 'call-1'
    });

    expect(result).toEqual([
      {
        sandboxEvent: {
          id: 'call-1',
          status: 'referenced',
          skillId: 'skill-1',
          versionId: undefined,
          sandboxId: 'logical-123',
          operationId: 'operation-123'
        }
      }
    ]);
  });

  it('should skip paths that do not end with /SKILL.md', () => {
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'TestSkill',
        description: 'A test skill',
        avatar: '',
        skillMdPath: '/work/skill/SKILL.md',
        directory: '/work/skill'
      }
    ]);

    const result = collectSkillReferenceResponses({
      paths: ['/work/skill/README.md', '/work/skill/index.ts'],
      sandboxContext: context,
      showSkillReferences: true,
      toolCallId: 'call-1'
    });

    expect(result).toEqual([]);
  });

  it('should collect skill reference for matching SKILL.md path', () => {
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'TestSkill',
        description: 'A test skill',
        avatar: 'avatar.png',
        skillMdPath: '/work/skill/SKILL.md',
        directory: '/work/skill'
      }
    ]);

    const result = collectSkillReferenceResponses({
      paths: ['/work/skill/SKILL.md'],
      sandboxContext: context,
      showSkillReferences: true,
      toolCallId: 'tool-call-123'
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      skills: [
        {
          id: 'tool-call-123',
          skillName: 'TestSkill',
          skillAvatar: 'avatar.png',
          description: 'A test skill',
          skillMdPath: '/work/skill/SKILL.md'
        }
      ]
    });
  });

  it('should match skill by directory prefix', () => {
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'TestSkill',
        description: 'A test skill',
        avatar: '',
        skillMdPath: '/work/myskill/SKILL.md',
        directory: '/work/myskill'
      }
    ]);

    const result = collectSkillReferenceResponses({
      paths: ['/work/myskill/subdir/SKILL.md'],
      sandboxContext: context,
      showSkillReferences: true,
      toolCallId: 'call-1'
    });

    expect(result).toHaveLength(1);
    expect(result[0].skills?.[0].skillName).toBe('TestSkill');
  });

  it('should call workflowStreamResponse with skillCall event', () => {
    const mockStreamResponse = vi.fn();
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'StreamSkill',
        description: 'Skill for stream test',
        avatar: 'stream.png',
        skillMdPath: '/work/stream/SKILL.md',
        directory: '/work/stream'
      }
    ]);

    collectSkillReferenceResponses({
      paths: ['/work/stream/SKILL.md'],
      sandboxContext: context,
      workflowStreamResponse: mockStreamResponse,
      showSkillReferences: true,
      toolCallId: 'stream-call-1'
    });

    expect(mockStreamResponse).toHaveBeenCalledTimes(1);
    expect(mockStreamResponse).toHaveBeenCalledWith({
      id: 'stream-call-1',
      event: SseResponseEventEnum.skillCall,
      data: {
        skill: {
          id: 'stream-call-1',
          skillName: 'StreamSkill',
          skillAvatar: 'stream.png',
          description: 'Skill for stream test',
          skillMdPath: '/work/stream/SKILL.md'
        }
      }
    });
  });

  it('should handle multiple SKILL.md paths', () => {
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'Skill1',
        description: 'First skill',
        avatar: '',
        skillMdPath: '/work/skill1/SKILL.md',
        directory: '/work/skill1'
      },
      {
        id: 'skill-2',
        name: 'Skill2',
        description: 'Second skill',
        avatar: '',
        skillMdPath: '/work/skill2/SKILL.md',
        directory: '/work/skill2'
      }
    ]);

    const result = collectSkillReferenceResponses({
      paths: ['/work/skill1/SKILL.md', '/work/skill2/SKILL.md'],
      sandboxContext: context,
      showSkillReferences: true,
      toolCallId: 'multi-call'
    });

    expect(result).toHaveLength(2);
    expect(result[0].skills?.[0].skillName).toBe('Skill1');
    expect(result[1].skills?.[0].skillName).toBe('Skill2');
  });

  it('should skip SKILL.md paths with no matching skill', () => {
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'Skill1',
        description: 'First skill',
        avatar: '',
        skillMdPath: '/work/skill1/SKILL.md',
        directory: '/work/skill1'
      }
    ]);

    const result = collectSkillReferenceResponses({
      paths: ['/work/unknown/SKILL.md'],
      sandboxContext: context,
      showSkillReferences: true,
      toolCallId: 'call-1'
    });

    expect(result).toEqual([]);
  });

  it('should use empty string for missing avatar', () => {
    const context = createMockSandboxContext([
      {
        id: 'skill-1',
        name: 'NoAvatarSkill',
        description: 'Skill without avatar',
        avatar: undefined as any,
        skillMdPath: '/work/skill/SKILL.md',
        directory: '/work/skill'
      }
    ]);

    const result = collectSkillReferenceResponses({
      paths: ['/work/skill/SKILL.md'],
      sandboxContext: context,
      showSkillReferences: true,
      toolCallId: 'call-1'
    });

    expect(result[0].skills?.[0].skillAvatar).toBe('');
  });
});
