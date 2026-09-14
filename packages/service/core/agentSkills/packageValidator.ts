import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/agentSkills/type';
import { getSkillSizeLimits } from './sandboxConfig';
import { extractSkillFromMarkdown } from './utils';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_UINT16 = 0xffff;
const ZIP64_UINT32 = 0xffffffff;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_REGULAR_FILE = 0o100000;
const UNIX_DIRECTORY = 0o040000;
const FIXED_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');
const TEXT_FILE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
]);

export type SkillPackageValidationReason =
  | 'invalid_zip'
  | 'archive_too_large'
  | 'too_many_files'
  | 'file_too_large'
  | 'uncompressed_size_exceeded'
  | 'path_too_deep'
  | 'absolute_path'
  | 'path_traversal'
  | 'invalid_path'
  | 'duplicate_path'
  | 'unsupported_file_type'
  | 'unsupported_compression'
  | 'encrypted_entry'
  | 'invalid_utf8'
  | 'invalid_frontmatter'
  | 'missing_skill_md'
  | 'invalid_layout'
  | 'legacy_layout_not_allowed'
  | 'duplicate_runtime_name'
  | 'runtime_name_mismatch'
  | 'invalid_entrypoint'
  | 'checksum_mismatch';

export class SkillPackageValidationError extends Error {
  constructor(
    public readonly reason: SkillPackageValidationReason,
    message: string
  ) {
    super(message);
    this.name = 'SkillPackageValidationError';
  }
}

export type SkillPackageLimits = {
  maxArchiveBytes: number;
  maxUncompressedBytes: number;
  maxEntries: number;
  maxFileBytes: number;
  maxDepth: number;
};

export type ValidateSkillPackageOptions = {
  allowLegacyLayout?: boolean;
  limits?: Partial<SkillPackageLimits>;
};

export type ValidatedSkillPackage = {
  zipBuffer: Buffer;
  contentHash: string;
  runtimeSkills: RuntimeSkillMetadataType[];
  fileCount: number;
  totalUncompressedBytes: number;
  legacyLayout: boolean;
};

type ParsedZipEntry = {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  crc32: number;
  localHeaderOffset: number;
  isDirectory: boolean;
  unixPermissions?: number;
};

function validationError(reason: SkillPackageValidationReason, message: string): never {
  throw new SkillPackageValidationError(reason, message);
}

export function getSkillPackageLimits(): SkillPackageLimits {
  const { maxUploadBytes, maxUncompressedBytes } = getSkillSizeLimits();
  return {
    maxArchiveBytes: maxUploadBytes,
    maxUncompressedBytes,
    maxEntries: 1000,
    maxFileBytes: Math.min(20 * 1024 * 1024, maxUncompressedBytes),
    maxDepth: 12
  };
}

function decodeZipPath(bytes: Buffer, utf8: boolean): string {
  if (!utf8 && bytes.some((byte) => byte > 0x7f)) {
    validationError('invalid_utf8', 'ZIP entry names must be UTF-8 or ASCII');
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    validationError('invalid_utf8', 'ZIP entry name is not valid UTF-8');
  }
}

function normalizeAndValidatePath(rawPath: string, maxDepth: number): string {
  if (rawPath.includes('\0')) validationError('invalid_path', 'ZIP entry path contains NUL');
  if (rawPath.startsWith('/') || rawPath.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
    validationError('absolute_path', 'Absolute ZIP entry paths are not allowed');
  }
  if (rawPath.includes('\\')) {
    validationError('invalid_path', 'Backslashes are not allowed in ZIP entry paths');
  }

  const hasTrailingSlash = rawPath.endsWith('/');
  const pathWithoutTrailingSlash = hasTrailingSlash ? rawPath.slice(0, -1) : rawPath;
  const segments = pathWithoutTrailingSlash.split('/');
  if (segments.some((segment) => segment === '..')) {
    validationError('path_traversal', 'ZIP entry path traversal is not allowed');
  }
  if (
    pathWithoutTrailingSlash.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '.')
  ) {
    validationError('invalid_path', 'ZIP entry path contains an empty or dot segment');
  }
  if (segments.length > maxDepth) {
    validationError('path_too_deep', 'ZIP entry path exceeds the configured depth limit');
  }

  const normalized = segments.map((segment) => segment.normalize('NFC')).join('/');
  return hasTrailingSlash ? `${normalized}/` : normalized;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliestOffset = Math.max(0, buffer.length - 22 - ZIP64_UINT16);
  for (let offset = buffer.length - 22; offset >= earliestOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  return validationError('invalid_zip', 'ZIP end-of-central-directory record was not found');
}

function parseCentralDirectory(buffer: Buffer, limits: SkillPackageLimits): ParsedZipEntry[] {
  if (buffer.length > limits.maxArchiveBytes) {
    validationError('archive_too_large', 'Skill package exceeds the compressed size limit');
  }
  if (buffer.length < 22) validationError('invalid_zip', 'ZIP archive is truncated');

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === ZIP64_UINT16 ||
    centralDirectorySize === ZIP64_UINT32 ||
    centralDirectoryOffset === ZIP64_UINT32
  ) {
    validationError('invalid_zip', 'Multi-disk and ZIP64 archives are not supported');
  }
  if (entryCount === 0) validationError('missing_skill_md', 'Skill package is empty');
  if (entryCount > limits.maxEntries) {
    validationError('too_many_files', 'Skill package contains too many entries');
  }
  if (centralDirectoryOffset + centralDirectorySize > eocdOffset) {
    validationError('invalid_zip', 'ZIP central directory is outside the archive');
  }

  const entries: ParsedZipEntry[] = [];
  const normalizedPaths = new Set<string>();
  let offset = centralDirectoryOffset;
  let declaredTotalSize = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
      validationError('invalid_zip', 'ZIP central directory entry is invalid');
    }

    const versionMadeBy = buffer.readUInt16LE(offset + 4);
    const generalPurposeFlag = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + filenameLength + extraLength + commentLength;

    if (entryEnd > buffer.length) validationError('invalid_zip', 'ZIP entry is truncated');
    if (
      compressedSize === ZIP64_UINT32 ||
      uncompressedSize === ZIP64_UINT32 ||
      localHeaderOffset === ZIP64_UINT32 ||
      diskStart !== 0
    ) {
      validationError('invalid_zip', 'ZIP64 and multi-disk entries are not supported');
    }
    if ((generalPurposeFlag & 0x1) !== 0) {
      validationError('encrypted_entry', 'Encrypted ZIP entries are not supported');
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      validationError(
        'unsupported_compression',
        'ZIP entry uses an unsupported compression method'
      );
    }

    const rawPath = decodeZipPath(
      buffer.subarray(offset + 46, offset + 46 + filenameLength),
      (generalPurposeFlag & 0x800) !== 0
    );
    const path = normalizeAndValidatePath(rawPath, limits.maxDepth);
    const duplicateKey = path.normalize('NFC').toLocaleLowerCase('en-US');
    if (normalizedPaths.has(duplicateKey)) {
      validationError('duplicate_path', `Duplicate normalized ZIP entry path: ${path}`);
    }
    normalizedPaths.add(duplicateKey);

    const platform = versionMadeBy >>> 8;
    const unixPermissions = platform === 3 ? externalAttributes >>> 16 : undefined;
    const unixFileType = unixPermissions ? unixPermissions & UNIX_FILE_TYPE_MASK : 0;
    const isDirectory = path.endsWith('/') || unixFileType === UNIX_DIRECTORY;
    if (
      unixFileType !== 0 &&
      unixFileType !== UNIX_REGULAR_FILE &&
      unixFileType !== UNIX_DIRECTORY
    ) {
      validationError('unsupported_file_type', 'Links and device entries are not allowed');
    }
    if (!isDirectory && uncompressedSize > limits.maxFileBytes) {
      validationError('file_too_large', `ZIP entry exceeds the single-file limit: ${path}`);
    }
    declaredTotalSize += isDirectory ? 0 : uncompressedSize;
    if (declaredTotalSize > limits.maxUncompressedBytes) {
      validationError('uncompressed_size_exceeded', 'Skill package exceeds the output size limit');
    }
    if (path.split('/').at(-1)?.toLowerCase() === 'entrypoint.sh' && path !== 'entrypoint.sh') {
      validationError('invalid_entrypoint', 'entrypoint.sh is only allowed at the package root');
    }
    if (
      path === 'entrypoint.sh' &&
      unixPermissions !== undefined &&
      (unixPermissions & 0o111) === 0
    ) {
      validationError('invalid_entrypoint', 'entrypoint.sh must be executable');
    }

    entries.push({
      path,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      crc32,
      localHeaderOffset,
      isDirectory,
      unixPermissions
    });
    offset = entryEnd;
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    validationError('invalid_zip', 'ZIP central directory size does not match its entries');
  }
  return entries;
}

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    crcTable[value] = crc >>> 0;
  }
  return crcTable;
}

function calculateCrc32(buffer: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function extractEntry(buffer: Buffer, entry: ParsedZipEntry, limits: SkillPackageLimits): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER) {
    validationError('invalid_zip', `Invalid local header for ZIP entry: ${entry.path}`);
  }
  const filenameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + filenameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart > buffer.length || dataEnd > buffer.length) {
    validationError('invalid_zip', `Compressed data is truncated for ZIP entry: ${entry.path}`);
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  let content: Buffer;
  try {
    content =
      entry.compressionMethod === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: limits.maxFileBytes + 1 });
  } catch {
    validationError('file_too_large', `ZIP entry cannot be safely decompressed: ${entry.path}`);
  }
  if (content.length > limits.maxFileBytes) {
    validationError('file_too_large', `ZIP entry exceeds the single-file limit: ${entry.path}`);
  }
  if (content.length !== entry.uncompressedSize) {
    validationError('invalid_zip', `ZIP entry size does not match metadata: ${entry.path}`);
  }
  if (calculateCrc32(content) !== entry.crc32) {
    validationError('checksum_mismatch', `ZIP entry checksum mismatch: ${entry.path}`);
  }
  return content;
}

function isMacOSMetadata(path: string): boolean {
  const filename = path.split('/').at(-1) ?? '';
  return path.startsWith('__MACOSX/') || filename === '.DS_Store' || filename.startsWith('._');
}

function isTextFile(path: string): boolean {
  if (path.toLowerCase().endsWith('/skill.md') || path.toLowerCase() === 'skill.md') return true;
  const filename = path.split('/').at(-1) ?? '';
  if (filename === '.gitignore') return true;
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 && TEXT_FILE_EXTENSIONS.has(filename.slice(dotIndex).toLowerCase());
}

function decodeTextFile(path: string, content: Buffer): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
    if (text.includes('\0')) validationError('invalid_utf8', `Text file contains NUL: ${path}`);
    return text;
  } catch (error) {
    if (error instanceof SkillPackageValidationError) throw error;
    return validationError('invalid_utf8', `Text file is not valid UTF-8: ${path}`);
  }
}

function readRuntimeMetadata(path: string, content: Buffer): RuntimeSkillMetadataType {
  const markdown = decodeTextFile(path, content);
  const { skill, error } = extractSkillFromMarkdown(markdown);
  if (error || !skill || typeof skill.name !== 'string' || typeof skill.description !== 'string') {
    validationError('invalid_frontmatter', error ?? `Invalid SKILL.md frontmatter: ${path}`);
  }
  return {
    name: skill.name,
    description: skill.description,
    path: ''
  };
}

async function createCanonicalZip(
  fileMap: Map<string, Buffer>,
  permissions: Map<string, number | undefined>
): Promise<Buffer> {
  const zip = new JSZip();
  for (const path of [...fileMap.keys()].sort((left, right) => left.localeCompare(right))) {
    zip.file(path, fileMap.get(path)!, {
      createFolders: false,
      date: FIXED_ZIP_DATE,
      unixPermissions:
        UNIX_REGULAR_FILE |
        ((permissions.get(path) ?? (path.endsWith('.sh') ? 0o755 : 0o644)) & 0o777)
    });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

export async function validateAndNormalizeSkillPackage(
  zipBuffer: Buffer,
  options: ValidateSkillPackageOptions = {}
): Promise<ValidatedSkillPackage> {
  const limits = { ...getSkillPackageLimits(), ...options.limits };
  const entries = parseCentralDirectory(zipBuffer, limits);
  const extractedFiles = new Map<string, Buffer>();
  const extractedPermissions = new Map<string, number | undefined>();
  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const content = extractEntry(zipBuffer, entry, limits);
    totalUncompressedBytes += content.length;
    if (totalUncompressedBytes > limits.maxUncompressedBytes) {
      validationError('uncompressed_size_exceeded', 'Skill package exceeds the output size limit');
    }
    if (isMacOSMetadata(entry.path)) continue;
    if (isTextFile(entry.path)) decodeTextFile(entry.path, content);
    extractedFiles.set(entry.path, content);
    extractedPermissions.set(entry.path, entry.unixPermissions);
  }

  const canonicalSkillPaths = [...extractedFiles.keys()].filter((path) =>
    /^skills\/[^/]+\/SKILL\.md$/.test(path)
  );
  const legacySkillPaths = [...extractedFiles.keys()].filter(
    (path) => path === 'SKILL.md' || /^[^/]+\/SKILL\.md$/.test(path)
  );
  if (canonicalSkillPaths.length === 0 && legacySkillPaths.length === 0) {
    validationError('missing_skill_md', 'Skill package does not contain SKILL.md');
  }
  if (canonicalSkillPaths.length > 0 && legacySkillPaths.length > 0) {
    validationError('invalid_layout', 'Canonical and legacy Skill layouts cannot be mixed');
  }

  const legacyLayout = canonicalSkillPaths.length === 0;
  if (legacyLayout && options.allowLegacyLayout === false) {
    validationError('legacy_layout_not_allowed', 'Legacy Skill package layout is not allowed');
  }

  const skillPaths = legacyLayout ? legacySkillPaths : canonicalSkillPaths;
  const runtimeSkills: RuntimeSkillMetadataType[] = [];
  const runtimeNames = new Set<string>();
  const canonicalFiles = new Map<string, Buffer>();
  const canonicalPermissions = new Map<string, number | undefined>();

  for (const skillPath of skillPaths.sort()) {
    const metadata = readRuntimeMetadata(skillPath, extractedFiles.get(skillPath)!);
    const runtimeName = metadata.name;
    const runtimeKey = runtimeName.normalize('NFC').toLocaleLowerCase('en-US');
    if (runtimeNames.has(runtimeKey)) {
      validationError('duplicate_runtime_name', `Duplicate runtime Skill name: ${runtimeName}`);
    }
    runtimeNames.add(runtimeKey);

    const sourcePrefix = skillPath.slice(0, -'SKILL.md'.length);
    if (!legacyLayout) {
      const directoryName = skillPath.split('/')[1];
      if (directoryName !== runtimeName) {
        validationError(
          'runtime_name_mismatch',
          `Runtime directory ${directoryName} does not match frontmatter name ${runtimeName}`
        );
      }
    }

    const targetPrefix = `skills/${runtimeName}/`;
    for (const [path, content] of extractedFiles) {
      if (!path.startsWith(sourcePrefix)) continue;
      if (path === 'entrypoint.sh' || path === '.gitignore') continue;
      const relativePath = path.slice(sourcePrefix.length);
      if (!relativePath || relativePath === 'entrypoint.sh') continue;
      canonicalFiles.set(`${targetPrefix}${relativePath}`, content);
      canonicalPermissions.set(`${targetPrefix}${relativePath}`, extractedPermissions.get(path));
    }
    runtimeSkills.push({
      name: runtimeName,
      description: metadata.description,
      path: targetPrefix.slice(0, -1)
    });
  }

  if (!legacyLayout) {
    for (const path of extractedFiles.keys()) {
      if (path === 'entrypoint.sh' || path === '.gitignore' || path === 'skills/.gitignore')
        continue;
      if (
        !skillPaths.some((skillPath) => path.startsWith(skillPath.slice(0, -'SKILL.md'.length)))
      ) {
        validationError('invalid_layout', `File is outside a declared runtime Skill: ${path}`);
      }
    }
  } else if (skillPaths.some((path) => path === 'SKILL.md') && skillPaths.length > 1) {
    validationError('invalid_layout', 'Root legacy SKILL.md cannot be combined with other Skills');
  } else if (!skillPaths.some((path) => path === 'SKILL.md')) {
    for (const path of extractedFiles.keys()) {
      if (path === 'entrypoint.sh' || path === '.gitignore') continue;
      if (
        !skillPaths.some((skillPath) => path.startsWith(skillPath.slice(0, -'SKILL.md'.length)))
      ) {
        validationError('invalid_layout', `File is outside a legacy runtime Skill: ${path}`);
      }
    }
  }

  for (const path of ['entrypoint.sh', '.gitignore', 'skills/.gitignore']) {
    if (legacyLayout && path === 'skills/.gitignore') continue;
    const content = extractedFiles.get(path);
    if (content) {
      canonicalFiles.set(path, content);
      canonicalPermissions.set(path, extractedPermissions.get(path));
    }
  }

  runtimeSkills.sort((left, right) => left.path.localeCompare(right.path));
  const canonicalBuffer = await createCanonicalZip(canonicalFiles, canonicalPermissions);
  return {
    zipBuffer: canonicalBuffer,
    contentHash: createHash('sha256').update(canonicalBuffer).digest('hex'),
    runtimeSkills,
    fileCount: canonicalFiles.size,
    totalUncompressedBytes,
    legacyLayout
  };
}
