import { describe, expect, it } from 'vitest';
import { JSZip } from '@fastgpt/service/core/agentSkills/zipBuilder';
import { validateAndNormalizeSkillPackage } from '@fastgpt/service/core/agentSkills/packageValidator';

const skillMd = (name = 'demo', description = 'Demo skill') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# Demo\n`;

async function createZip(
  entries: Array<{
    path: string;
    content?: string | Buffer;
    unixPermissions?: number;
  }>
) {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, entry.content ?? '', {
      unixPermissions: entry.unixPermissions
    });
  }
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
}

async function expectReason(
  buffer: Buffer,
  reason: string,
  options?: Parameters<typeof validateAndNormalizeSkillPackage>[1]
) {
  await expect(validateAndNormalizeSkillPackage(buffer, options)).rejects.toMatchObject({ reason });
}

describe('validateAndNormalizeSkillPackage', () => {
  it.each(['skills/demo/SKILL.md', 'demo/SKILL.md', 'SKILL.md'])(
    'discards macOS metadata without changing Skill files or the normalized hash for %s',
    async (path) => {
      const prefix = path.slice(0, -'SKILL.md'.length);
      const files = [
        { path, content: skillMd() },
        { path: `${prefix}scripts/run.py`, content: 'print("demo")\n' },
        { path: `${prefix}.gitignore`, content: '*.tmp\n' }
      ];
      const metadata = Buffer.from([0x00, 0x05, 0x16, 0x07, 0xff]);
      const clean = await validateAndNormalizeSkillPackage(await createZip(files));
      const result = await validateAndNormalizeSkillPackage(
        await createZip([
          ...files,
          { path: `__MACOSX/${prefix}._SKILL.md`, content: metadata },
          { path: `${prefix}._SKILL.md`, content: metadata },
          { path: `${prefix}scripts/._run.py`, content: metadata },
          { path: `${prefix}.DS_Store`, content: metadata },
          { path: '__MACOSX/._package', content: metadata }
        ])
      );

      expect(result.contentHash).toBe(clean.contentHash);
      expect(result.zipBuffer.equals(clean.zipBuffer)).toBe(true);
      expect(result.fileCount).toBe(clean.fileCount);
      expect(result.runtimeSkills).toEqual(clean.runtimeSkills);
    }
  );

  it.each([
    ['__MACOSX/../escape.txt', 'path_traversal', undefined],
    ['/__MACOSX/._SKILL.md', 'absolute_path', undefined],
    ['__MACOSX/._SKILL.md', 'unsupported_file_type', 0o120777],
    ['skills/demo/._link', 'unsupported_file_type', 0o120777]
  ] as const)('still rejects unsafe metadata entry %s', async (path, reason, unixPermissions) => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path, content: 'target', unixPermissions }
    ]);
    await expectReason(buffer, reason);
  });

  it('counts macOS metadata toward decompression and entry limits', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: '__MACOSX/._SKILL.md', content: Buffer.alloc(128) }
    ]);
    await expectReason(buffer, 'file_too_large', {
      limits: { maxFileBytes: 100 }
    });
    await expectReason(buffer, 'uncompressed_size_exceeded', {
      limits: { maxUncompressedBytes: Buffer.byteLength(skillMd()) + 127 }
    });
    await expectReason(buffer, 'too_many_files', {
      limits: { maxEntries: 3 }
    });
  });

  it('does not accept a package containing only macOS metadata', async () => {
    await expectReason(
      await createZip([{ path: '__MACOSX/._SKILL.md', content: Buffer.from([0xff]) }]),
      'missing_skill_md'
    );
  });

  it.each([
    ['STORE', 'checksum_mismatch'],
    ['DEFLATE', 'file_too_large']
  ] as const)(
    'still validates corrupt metadata compressed with %s',
    async (compression, reason) => {
      const zip = new JSZip();
      zip.file('__MACOSX/._SKILL.md', 'metadata payload', { createFolders: false });
      zip.file('skills/demo/SKILL.md', skillMd(), { createFolders: false });
      const buffer = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression });
      const dataStart = 30 + buffer.readUInt16LE(26) + buffer.readUInt16LE(28);
      buffer[dataStart] = compression === 'STORE' ? buffer[dataStart] ^ 0xff : 0x07;
      await expectReason(buffer, reason);
    }
  );

  it('does not ignore unrelated files resembling macOS metadata', async () => {
    await expectReason(
      await createZip([
        { path: 'skills/demo/SKILL.md', content: skillMd() },
        { path: '__MACOSX-backup/readme.txt', content: 'not metadata' }
      ]),
      'invalid_layout'
    );
  });

  it.each(['skills/demo/SKILL.md', 'SKILL.md', 'demo/SKILL.md'])(
    'preserves root gitignore when normalizing %s without moving it into the runtime Skill',
    async (path) => {
      const buffer = await createZip([
        { path, content: skillMd() },
        { path: '.gitignore', content: '*.tmp\n' }
      ]);
      const result = await validateAndNormalizeSkillPackage(buffer);
      const zip = await JSZip.loadAsync(result.zipBuffer);
      expect(await zip.file('.gitignore')?.async('string')).toBe('*.tmp\n');
      expect(zip.file('skills/demo/.gitignore')).toBeNull();
    }
  );
  it('accepts the canonical layout and returns runtime metadata plus a deterministic hash', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/scripts/run.sh', content: '#!/bin/sh\necho ok\n' }
    ]);

    const first = await validateAndNormalizeSkillPackage(buffer);
    const second = await validateAndNormalizeSkillPackage(buffer);

    expect(first.legacyLayout).toBe(false);
    expect(first.runtimeSkills).toEqual([
      { name: 'demo', description: 'Demo skill', path: 'skills/demo' }
    ]);
    expect(first.contentHash).toMatch(/^[a-f\d]{64}$/);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.zipBuffer.equals(first.zipBuffer)).toBe(true);
  });

  it('preserves ordinary permission bits while stripping special execution bits', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/run', content: '#!/bin/sh\n', unixPermissions: 0o104750 },
      { path: 'skills/demo/data.sh', content: '# source only\n', unixPermissions: 0o100640 }
    ]);
    const result = await validateAndNormalizeSkillPackage(buffer);
    const zip = await JSZip.loadAsync(result.zipBuffer);
    expect(zip.file('skills/demo/run')?.unixPermissions).toBe(0o100750);
    expect(zip.file('skills/demo/data.sh')?.unixPermissions).toBe(0o100640);
  });

  it('rejects other root files alongside a valid root gitignore', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: '.gitignore', content: 'other.txt\n' },
      { path: 'other.txt', content: 'outside runtime skill' }
    ]);
    await expectReason(buffer, 'invalid_layout');
  });

  it('rejects invalid UTF-8 in gitignore rules', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: '.gitignore', content: Buffer.from([0xff]) }
    ]);
    await expectReason(buffer, 'invalid_utf8');
  });

  it.each(['SKILL.md', 'demo/SKILL.md'])(
    'reads legacy %s and rewrites it to the canonical layout',
    async (path) => {
      const buffer = await createZip([
        { path, content: skillMd() },
        { path: path.replace('SKILL.md', 'asset.txt'), content: 'asset' }
      ]);

      const result = await validateAndNormalizeSkillPackage(buffer);
      const canonicalZip = await JSZip.loadAsync(result.zipBuffer);

      expect(result.legacyLayout).toBe(true);
      expect(Object.keys(canonicalZip.files)).toContain('skills/demo/SKILL.md');
      expect(Object.keys(canonicalZip.files)).toContain('skills/demo/asset.txt');
    }
  );

  it('rejects legacy layout when compatibility is disabled', async () => {
    const buffer = await createZip([{ path: 'SKILL.md', content: skillMd() }]);
    await expectReason(buffer, 'legacy_layout_not_allowed', { allowLegacyLayout: false });
  });

  it('rejects archives larger than the compressed size limit', async () => {
    const buffer = await createZip([{ path: 'skills/demo/SKILL.md', content: skillMd() }]);
    await expectReason(buffer, 'archive_too_large', {
      limits: { maxArchiveBytes: buffer.length - 1 }
    });
  });

  it('rejects too many entries', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/a.txt', content: 'a' }
    ]);
    await expectReason(buffer, 'too_many_files', { limits: { maxEntries: 1 } });
  });

  it('rejects oversized individual files and oversized total output', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/data.bin', content: Buffer.alloc(32) }
    ]);
    await expectReason(buffer, 'file_too_large', { limits: { maxFileBytes: 16 } });
    await expectReason(buffer, 'uncompressed_size_exceeded', {
      limits: { maxUncompressedBytes: 32 }
    });
  });

  it('rejects excessive directory depth', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/a/b/c/file.txt', content: 'x' }
    ]);
    await expectReason(buffer, 'path_too_deep', { limits: { maxDepth: 4 } });
  });

  it.each([
    ['../escape.txt', 'path_traversal'],
    ['/absolute.txt', 'absolute_path'],
    ['C:/windows.txt', 'absolute_path'],
    ['skills/demo/a\\b.txt', 'invalid_path']
  ])('rejects unsafe path %s', async (path, reason) => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path, content: 'x' }
    ]);
    await expectReason(buffer, reason);
  });

  it('rejects duplicate normalized paths', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/README.md', content: 'one' },
      { path: 'skills/demo/readme.md', content: 'two' }
    ]);
    await expectReason(buffer, 'duplicate_path');
  });

  it.each([
    ['symbolic links', 0o120777],
    ['device files', 0o020666]
  ])('rejects %s', async (_label, unixPermissions) => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/unsafe', content: 'target', unixPermissions }
    ]);
    await expectReason(buffer, 'unsupported_file_type');
  });

  it('rejects invalid UTF-8 in text files', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: Buffer.from([0xff, 0xfe, 0xfd]) }
    ]);
    await expectReason(buffer, 'invalid_utf8');
  });

  it('rejects missing or invalid frontmatter', async () => {
    const missing = await createZip([
      { path: 'skills/demo/SKILL.md', content: '# no frontmatter' }
    ]);
    await expectReason(missing, 'invalid_frontmatter');

    const missingDescription = await createZip([
      { path: 'skills/demo/SKILL.md', content: '---\nname: demo\n---\n' }
    ]);
    await expectReason(missingDescription, 'invalid_frontmatter');
  });

  it('rejects duplicate runtime names across multiple skills', async () => {
    const buffer = await createZip([
      { path: 'first/SKILL.md', content: skillMd('same') },
      { path: 'second/SKILL.md', content: skillMd('same') }
    ]);
    await expectReason(buffer, 'duplicate_runtime_name');
  });

  it('rejects a runtime directory that does not match frontmatter name', async () => {
    const buffer = await createZip([
      { path: 'skills/directory-name/SKILL.md', content: skillMd('frontmatter-name') }
    ]);
    await expectReason(buffer, 'runtime_name_mismatch');
  });

  it('rejects entrypoint outside the package root', async () => {
    const buffer = await createZip([
      { path: 'skills/demo/SKILL.md', content: skillMd() },
      { path: 'skills/demo/entrypoint.sh', content: '#!/bin/sh\n' }
    ]);
    await expectReason(buffer, 'invalid_entrypoint');
  });
});
