import { describe, expect, it } from 'vitest';
import { buildSkillsContextPrompt } from '../../../../core/workflow/dispatch/ai/agent/sub/sandbox/prompt';
import {
  allSandboxTools,
  SandboxWriteFileSchema,
  SandboxFetchUserFileSchema
} from '@fastgpt/global/core/workflow/node/agent/skillTools';

describe('Sandbox prompt path contract', () => {
  it('区别共享工作区与会话 cwd，明确相对路径不得重复目录前缀', () => {
    const prompt = buildSkillsContextPrompt([], '/workspace/sessions/chat', '/workspace');
    expect(prompt).toContain('Workspace root: /workspace\n');
    expect(prompt).toContain('Current working directory: /workspace/sessions/chat');
    expect(prompt).toContain('All relative file paths and the default command cwd');
    expect(prompt).toContain('Do not repeat the current working directory in a relative path');
    expect(prompt).toContain(
      '"helloworld.html" resolves to "/workspace/sessions/chat/helloworld.html"'
    );
  });

  it('保留 Skill 编辑根目录默认值和部署 Skill 的绝对位置', () => {
    const prompt = buildSkillsContextPrompt(
      [
        {
          id: 'skill',
          name: 'Skill',
          description: 'Description',
          directory: '/workspace/.runtime/current/skill',
          skillMdPath: '/workspace/.runtime/current/skill/SKILL.md'
        }
      ],
      '/workspace/edit'
    );
    expect(prompt).toContain('Workspace root: /workspace/edit');
    expect(prompt).toContain('<location>/workspace/.runtime/current/skill/SKILL.md</location>');
    expect(prompt).toContain('Absolute paths inside the workspace must keep the leading "/"');
  });

  it('工具参数与提示词使用相同的 cwd 路径约定', () => {
    for (const tool of allSandboxTools) {
      expect(JSON.stringify(tool.function.parameters)).toContain('current working directory');
    }
    expect(SandboxWriteFileSchema.shape.path.description).toBe(
      SandboxFetchUserFileSchema.shape.target_path.description
    );
    expect(SandboxWriteFileSchema.shape.path.description).toContain('Do not repeat');
  });
});
