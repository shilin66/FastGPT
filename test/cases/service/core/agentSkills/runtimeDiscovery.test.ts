import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverRuntimeSandboxSkills } from '@fastgpt/service/core/agentSkills/runtimeDiscovery';

const execute = promisify(execFile);
const provider = {
  execute: async (command: string) => {
    const result = await execute('/bin/sh', ['-c', command], { maxBuffer: 8 * 1024 * 1024 });
    return { ...result, exitCode: 0 };
  }
};

describe('Runtime workspace Skill discovery', () => {
  let workspaceRoot: string;
  const put = async (path: string, content: string) => {
    const target = join(workspaceRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    return target;
  };
  const skill = (name = 'demo', description = 'Local instructions') =>
    `---\nname: ${name}\ndescription: ${description}\n---\nInstructions\n`;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'fastgpt-discovery-'));
  });
  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('reads current published metadata and discovers same-named local Skills with distinct identities', async () => {
    const skillMdPath = await put(
      '.runtime/skills/resource/version/generation/skills/demo/SKILL.md',
      skill('demo', 'Edited instructions')
    );
    await put('skills/demo/SKILL.md', skill());
    await put('sessions/old/skills/hidden/SKILL.md', skill('hidden'));
    await put('.runtime/skills/removed/skills/hidden/SKILL.md', skill('hidden'));
    const skills = await discoverRuntimeSandboxSkills({
      provider,
      workspaceRoot,
      publishedSkills: [
        {
          id: 'resource',
          versionId: 'version',
          source: 'published',
          name: 'demo',
          description: 'Published instructions',
          directory: dirname(skillMdPath),
          skillMdPath
        }
      ]
    });
    expect(skills).toHaveLength(2);
    expect(skills[0]).toMatchObject({
      id: 'resource',
      versionId: 'version',
      source: 'published',
      description: 'Edited instructions',
      skillMdPath
    });
    expect(skills[1]).toMatchObject({
      id: 'workspace:skills/demo',
      source: 'workspace',
      description: 'Local instructions',
      skillMdPath: join(workspaceRoot, 'skills/demo/SKILL.md')
    });
  });

  it('isolates missing, invalid, oversized and symlinked Skill files', async () => {
    await put('skills/valid/SKILL.md', skill('valid'));
    await put('skills/invalid/SKILL.md', 'not a Skill');
    await put('skills/oversized/SKILL.md', skill('oversized') + 'x'.repeat(70 * 1024));
    const outside = await mkdtemp(join(tmpdir(), 'fastgpt-discovery-outside-'));
    try {
      await writeFile(join(outside, 'SKILL.md'), skill('outside'));
      await symlink(outside, join(workspaceRoot, 'skills', 'linked'));
      const skillMdPath = join(workspaceRoot, '.runtime/removed/SKILL.md');
      const skills = await discoverRuntimeSandboxSkills({
        provider,
        workspaceRoot,
        publishedSkills: [
          {
            id: 'removed',
            name: 'removed',
            description: '',
            directory: dirname(skillMdPath),
            skillMdPath
          }
        ]
      });
      expect(skills.map((entry) => entry.name)).toEqual(['valid']);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('does not follow a symlink replacing the shared Skills directory', async () => {
    await put('sessions/hidden/SKILL.md', skill('hidden'));
    await symlink(join(workspaceRoot, 'sessions'), join(workspaceRoot, 'skills'));
    expect(
      await discoverRuntimeSandboxSkills({ provider, workspaceRoot, publishedSkills: [] })
    ).toEqual([]);
  });

  it('bounds the number of discovered workspace Skills', async () => {
    for (let index = 0; index < 140; index++)
      await put(`skills/skill-${index}/SKILL.md`, skill(`skill-${index}`));
    const skills = await discoverRuntimeSandboxSkills({
      provider,
      workspaceRoot,
      publishedSkills: []
    });
    expect(skills).toHaveLength(128);
  });
});
