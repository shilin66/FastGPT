import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JSZip } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { deploySandboxSkillPackages } from '@fastgpt/service/core/agentSkills/sandboxDeployment';

const execute = promisify(execFile);

describe('Atomic sandbox Skill deployment', () => {
  let workspaceRoot: string;
  let provider: Parameters<typeof deploySandboxSkillPackages>[0]['provider'];

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'fastgpt-deployment-'));
    provider = {
      execute: async (command) => {
        try {
          const result = await execute('/bin/sh', ['-c', command], { maxBuffer: 4 * 1024 * 1024 });
          return { ...result, exitCode: 0 };
        } catch (error) {
          return {
            stdout: '',
            stderr: error instanceof Error ? error.message : 'execution failed',
            exitCode: 1
          };
        }
      },
      writeFiles: vi.fn(async (files: Parameters<typeof provider.writeFiles>[0]) => {
        for (const file of files) {
          if (typeof file.data !== 'string' && !(file.data instanceof Uint8Array)) {
            throw new Error('Deployment tests expect normalized bytes or strings');
          }
          await mkdir(dirname(file.path), { recursive: true });
          await writeFile(file.path, file.data);
        }
        return [];
      })
    };
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const packageFor = async (
    input: { skillId?: string; versionId?: string; text?: string } = {}
  ) => {
    const zip = new JSZip();
    zip.file(
      'skills/demo/SKILL.md',
      `---\nname: demo\ndescription: Demo\n---\n${input.text ?? 'first'}`
    );
    zip.file("skills/demo/notes'; touch UNSAFE; '.txt", 'quoted-file');
    return {
      skillId: input.skillId ?? '111111111111111111111111',
      versionId: input.versionId ?? '222222222222222222222222',
      packageBuffer: await zip.generateAsync({ type: 'nodebuffer' })
    };
  };
  const manifestPath = () => join(workspaceRoot, '.runtime/current/manifest.json');

  it('deploys verified files to the manifest path and preserves ordinary workspace files', async () => {
    await writeFile(join(workspaceRoot, 'user-notes.txt'), 'draft');
    const result = await deploySandboxSkillPackages({
      provider,
      workspaceRoot,
      packages: [await packageFor()]
    });
    const skill = result.deployedSkills[0];
    expect(skill.skillMdPath).toBe(
      join(workspaceRoot, '.runtime/current/111111111111111111111111/skills/demo/SKILL.md')
    );
    expect(result.manifest.entries[0].generation).toContain(
      '.runtime/skills/111111111111111111111111/222222222222222222222222/'
    );
    expect(await readFile(skill.skillMdPath, 'utf8')).toContain('first');
    expect(await readFile(join(skill.directory, "notes'; touch UNSAFE; '.txt"), 'utf8')).toBe(
      'quoted-file'
    );
    expect(await readFile(join(workspaceRoot, 'user-notes.txt'), 'utf8')).toBe('draft');
    expect(JSON.parse(await readFile(manifestPath(), 'utf8'))).toEqual(result.manifest);
  });

  it('skips upload only while all files still match the published hash', async () => {
    const item = await packageFor();
    const first = await deploySandboxSkillPackages({ provider, workspaceRoot, packages: [item] });
    vi.mocked(provider.writeFiles).mockClear();
    const second = await deploySandboxSkillPackages({ provider, workspaceRoot, packages: [item] });
    expect(provider.writeFiles).not.toHaveBeenCalled();
    expect(second.manifest).toEqual(first.manifest);
    await unlink(first.deployedSkills[0].skillMdPath);
    const repaired = await deploySandboxSkillPackages({
      provider,
      workspaceRoot,
      packages: [item]
    });
    expect(repaired.manifest.entries[0].generation).not.toBe(first.manifest.entries[0].generation);
    expect(repaired.deployedSkills[0].skillMdPath).toBe(first.deployedSkills[0].skillMdPath);
    expect(await readFile(repaired.deployedSkills[0].skillMdPath, 'utf8')).toContain('first');
  });

  it('preserves the active batch if a later upload fails', async () => {
    const original = await packageFor();
    await deploySandboxSkillPackages({ provider, workspaceRoot, packages: [original] });
    const before = await readFile(manifestPath(), 'utf8');
    const originalWrite = provider.writeFiles;
    let calls = 0;
    provider.writeFiles = async (files) => {
      calls += 1;
      if (calls === 2) throw new Error('injected upload failure');
      return originalWrite(files);
    };
    await expect(
      deploySandboxSkillPackages({
        provider,
        workspaceRoot,
        packages: [
          await packageFor({ versionId: '333333333333333333333333' }),
          await packageFor({ skillId: '444444444444444444444444' })
        ]
      })
    ).rejects.toThrow('injected upload failure');
    expect(await readFile(manifestPath(), 'utf8')).toBe(before);
  });

  it('keeps same-named Skill resources separate and switches only the requested active set', async () => {
    const first = await packageFor();
    const second = await packageFor({
      skillId: '444444444444444444444444',
      text: 'other resource'
    });
    const deployed = await deploySandboxSkillPackages({
      provider,
      workspaceRoot,
      packages: [first, second]
    });
    expect(deployed.deployedSkills.map((skill) => skill.id)).toEqual([
      first.skillId,
      second.skillId
    ]);
    expect(new Set(deployed.deployedSkills.map((skill) => skill.directory)).size).toBe(2);
    const update = await packageFor({ versionId: '333333333333333333333333', text: 'updated' });
    const updated = await deploySandboxSkillPackages({
      provider,
      workspaceRoot,
      packages: [update]
    });
    expect(updated.deployedSkills).toHaveLength(1);
    expect(await readFile(updated.deployedSkills[0].skillMdPath, 'utf8')).toContain('updated');
    expect(
      await readFile(
        join(workspaceRoot, deployed.manifest.entries[1].generation, 'skills/demo/SKILL.md'),
        'utf8'
      )
    ).toContain('other resource');
    const empty = await deploySandboxSkillPackages({ provider, workspaceRoot, packages: [] });
    expect(empty.deployedSkills).toEqual([]);
    expect(
      await readFile(
        join(workspaceRoot, updated.manifest.entries[0].generation, 'skills/demo/SKILL.md'),
        'utf8'
      )
    ).toContain('updated');
  });

  it('rejects a mismatched package checksum and path identifiers before upload', async () => {
    await expect(
      deploySandboxSkillPackages({
        provider,
        workspaceRoot,
        packages: [{ ...(await packageFor()), contentHash: '0'.repeat(64) }]
      })
    ).rejects.toThrow('hash');
    await expect(
      deploySandboxSkillPackages({
        provider,
        workspaceRoot,
        packages: [await packageFor({ skillId: '../escape' })]
      })
    ).rejects.toThrow();
    expect(provider.writeFiles).not.toHaveBeenCalled();
  });

  it('rejects a runtime namespace symlink escape without touching its target', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'fastgpt-deployment-outside-'));
    try {
      await symlink(outside, join(workspaceRoot, '.runtime'));
      await expect(
        deploySandboxSkillPackages({ provider, workspaceRoot, packages: [await packageFor()] })
      ).rejects.toThrow();
      expect(provider.writeFiles).not.toHaveBeenCalled();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('does not activate after the deployment lease is lost', async () => {
    await deploySandboxSkillPackages({ provider, workspaceRoot, packages: [await packageFor()] });
    const before = await readFile(manifestPath(), 'utf8');
    const originalWrite = provider.writeFiles;
    let lost = false;
    provider.writeFiles = async (files) => {
      const result = await originalWrite(files);
      if (files.length === 1) lost = true;
      return result;
    };
    await expect(
      deploySandboxSkillPackages({
        provider,
        workspaceRoot,
        packages: [await packageFor({ versionId: '333333333333333333333333' })],
        assertActive: async () => {
          if (lost) throw new Error('lease lost');
        }
      })
    ).rejects.toThrow('lease lost');
    expect(await readFile(manifestPath(), 'utf8')).toBe(before);
  });

  it('uploads large file manifests separately instead of exceeding shell argument limits', async () => {
    const zip = new JSZip();
    zip.file('skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo\n---\n');
    for (let i = 0; i < 400; i += 1) {
      zip.file('skills/demo/' + String(i).padStart(3, '0') + '-'.repeat(220) + '.txt', 'data');
    }
    const result = await deploySandboxSkillPackages({
      provider,
      workspaceRoot,
      packages: [
        { ...(await packageFor()), packageBuffer: await zip.generateAsync({ type: 'nodebuffer' }) }
      ]
    });
    expect(result.manifest.entries[0].files).toHaveLength(401);
    expect((await readFile(manifestPath())).length).toBeGreaterThan(128 * 1024);
  });

  it('rejects a tampered active resource link instead of trusting valid generation files', async () => {
    const item = await packageFor();
    await deploySandboxSkillPackages({ provider, workspaceRoot, packages: [item] });
    const link = join(workspaceRoot, '.runtime/current', item.skillId);
    const other = join(workspaceRoot, 'ordinary-user-files');
    await mkdir(other);
    await unlink(link);
    await symlink(other, link);
    await expect(
      deploySandboxSkillPackages({ provider, workspaceRoot, packages: [item] })
    ).rejects.toThrow();
  });
});
