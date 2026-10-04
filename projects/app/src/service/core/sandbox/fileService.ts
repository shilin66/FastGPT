import { type SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import type archiver from 'archiver';
import mime from 'mime';
import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import {
  assertSandboxWorkspacePaths,
  assertSandboxWorkspacePath,
  resolveSandboxWorkspacePath
} from '@fastgpt/service/core/ai/sandbox/workspace';

export type SandboxFileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  version?: string;
};

export type SandboxFileContent = {
  content: Buffer;
  contentType: string;
  fileName: string;
  hash: string;
};

export async function listSandboxDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<SandboxFileEntry[]> {
  const dirPath = await assertSandboxWorkspacePath({
    provider: sandbox.provider,
    workspaceRoot: sandbox.workspaceRoot,
    path
  });
  let providerDirPath = dirPath;
  let entries = await sandbox.provider.listDirectory(providerDirPath);
  if (
    entries.length === 1 &&
    entries[0].isDirectory &&
    entries[0].name.startsWith(`${dirPath} -> `)
  ) {
    providerDirPath = `${dirPath}/`;
    entries = await sandbox.provider.listDirectory(providerDirPath);
  }
  const workspaceRoot = sandbox.workspaceRoot;
  const files: SandboxFileEntry[] = [];
  for (const entry of entries) {
    const linkMarker = entry.isDirectory ? entry.name.indexOf(' -> ') : -1;
    const name = linkMarker >= 0 ? entry.name.slice(0, linkMarker) : entry.name;
    if (!name || name === '.' || name.includes('/') || (!entry.isFile && !entry.isDirectory)) {
      throw new Error('Invalid Sandbox directory entry');
    }
    const normalizedListing = linkMarker >= 0 || providerDirPath !== dirPath;
    if (normalizedListing && entry.path !== `${providerDirPath}/${entry.name}`) {
      throw new Error('Invalid Sandbox directory entry');
    }
    const entryPath = resolveSandboxWorkspacePath({
      workspaceRoot,
      path: normalizedListing ? `${dirPath}/${name}` : entry.path
    });
    const expectedPath = resolveSandboxWorkspacePath({
      workspaceRoot,
      path: posix.join(dirPath, name)
    });
    if (entryPath !== expectedPath || posix.dirname(entryPath) !== dirPath) {
      throw new Error('Invalid Sandbox directory entry');
    }
    files.push({
      name,
      path: entryPath,
      type: entry.isDirectory ? 'directory' : 'file',
      size: entry.isFile ? entry.size : undefined,
      version:
        entry.modifiedAt instanceof Date && !Number.isNaN(entry.modifiedAt.getTime())
          ? `${entry.modifiedAt.getTime()}:${entry.size ?? 0}`
          : undefined
    });
  }
  await assertSandboxWorkspacePaths({
    provider: sandbox.provider,
    workspaceRoot,
    paths: files.map((file) => file.path)
  });
  return files;
}

const assertProviderResultPath = ({
  sandbox,
  expectedPath,
  returnedPath
}: {
  sandbox: SandboxClient;
  expectedPath: string;
  returnedPath: string;
}) => {
  const path = resolveSandboxWorkspacePath({
    workspaceRoot: sandbox.workspaceRoot,
    path: returnedPath
  });
  if (path !== expectedPath) throw new Error('Unexpected Sandbox file result');
};

export async function writeSandboxFile(
  sandbox: SandboxClient,
  path: string,
  content: string,
  expectedHash?: string
): Promise<string> {
  const safePath = await assertSandboxWorkspacePath({
    provider: sandbox.provider,
    workspaceRoot: sandbox.workspaceRoot,
    path,
    allowMissing: true
  });
  if (expectedHash) {
    const before = await sandbox.provider.readFiles([safePath]);
    const current = before[0];
    if (!current || current.error) throw new Error('sandbox_file_changed');
    assertProviderResultPath({ sandbox, expectedPath: safePath, returnedPath: current.path });
    const actualHash = createHash('sha256').update(current.content).digest('hex');
    if (actualHash !== expectedHash) throw new Error('sandbox_file_changed');
  }
  const results = await sandbox.provider.writeFiles([{ path: safePath, data: content }]);
  const result = results[0];
  if (!result) throw new Error('Missing Sandbox file result');
  if (result.error) {
    return Promise.reject(result.error);
  }
  assertProviderResultPath({ sandbox, expectedPath: safePath, returnedPath: result.path });
  return createHash('sha256').update(content).digest('hex');
}

export async function isSandboxPathDirectory(
  sandbox: SandboxClient,
  path: string
): Promise<boolean> {
  const safePath = await assertSandboxWorkspacePath({
    provider: sandbox.provider,
    workspaceRoot: sandbox.workspaceRoot,
    path
  });
  const fileInfoMap = await sandbox.provider.getFileInfo([safePath]);
  const fileInfo = fileInfoMap.get(safePath);
  if (fileInfo)
    assertProviderResultPath({ sandbox, expectedPath: safePath, returnedPath: fileInfo.path });
  return fileInfo?.isDirectory ?? (path === '.' || path === '' || path.endsWith('/'));
}

export async function getSandboxFileContent(
  sandbox: SandboxClient,
  path: string,
  preview?: boolean
): Promise<SandboxFileContent> {
  const safePath = await assertSandboxWorkspacePath({
    provider: sandbox.provider,
    workspaceRoot: sandbox.workspaceRoot,
    path
  });
  let result: Awaited<ReturnType<SandboxClient['provider']['readFiles']>>[number] | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = (await sandbox.provider.getFileInfo([safePath]))?.get(safePath);
    const results = await sandbox.provider.readFiles([safePath]);
    result = results[0];
    if (!result) throw new Error('Missing Sandbox file result');
    if (result.error) throw new Error(`Failed to read file: ${result.error.message}`);
    assertProviderResultPath({ sandbox, expectedPath: safePath, returnedPath: result.path });
    const after = (await sandbox.provider.getFileInfo([safePath]))?.get(safePath);
    const changed =
      before &&
      after &&
      (before.size !== after.size || before.modifiedAt?.getTime() !== after.modifiedAt?.getTime());
    if (!changed) break;
    if (attempt === 1) throw new Error('sandbox_file_changing');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  if (!result) throw new Error('Missing Sandbox file result');

  const fileName = path.split('/').pop() || 'file';
  // 注意：preview 模式下 contentType 由文件路径决定，可能返回 text/html / image/svg+xml 等危险类型。
  // 若未来有任何代码让浏览器直接导航到 download 端点（iframe / window.open 等），需确保这类内容不被同源渲染，否则会造成存储型 XSS。
  const contentType = preview
    ? mime.getType(path) ?? 'application/octet-stream'
    : 'application/octet-stream';

  return {
    content: Buffer.from(result.content),
    contentType,
    fileName,
    hash: createHash('sha256').update(result.content).digest('hex')
  };
}

const MAX_ARCHIVE_DEPTH = 20;

export async function addDirectoryToArchive(
  sandbox: SandboxClient,
  archive: archiver.Archiver,
  dirPath: string,
  archivePath: string,
  depth: number = 0
): Promise<void> {
  const assertActive = () => {
    if (archive.destroyed) throw new Error('Sandbox download cancelled');
  };
  assertActive();
  if (depth > MAX_ARCHIVE_DEPTH) throw new Error('Sandbox archive exceeds maximum directory depth');

  if (posix.isAbsolute(archivePath)) throw new Error('Invalid Sandbox archive path');
  resolveSandboxWorkspacePath({ workspaceRoot: '/archive', path: archivePath });
  const entries = await listSandboxDirectory(sandbox, dirPath);
  assertActive();

  for (const entry of entries) {
    const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

    if (entry.type === 'directory') {
      await addDirectoryToArchive(sandbox, archive, entry.path, entryArchivePath, depth + 1);
    } else {
      const safePath = await assertSandboxWorkspacePath({
        provider: sandbox.provider,
        workspaceRoot: sandbox.workspaceRoot,
        path: entry.path
      });
      assertActive();
      const results = await sandbox.provider.readFiles([safePath]);
      assertActive();
      const result = results[0];
      if (!result) throw new Error('Missing Sandbox file result');
      if (result.error) throw new Error(`Failed to archive file: ${result.error.message}`);
      assertProviderResultPath({ sandbox, expectedPath: safePath, returnedPath: result.path });
      archive.append(Buffer.from(result.content), { name: entryArchivePath });
    }
  }
}
