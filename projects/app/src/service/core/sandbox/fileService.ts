import { type SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import type archiver from 'archiver';
import mime from 'mime';
import { posix } from 'node:path';
import {
  assertSandboxWorkspacePath,
  resolveSandboxWorkspacePath
} from '@fastgpt/service/core/ai/sandbox/workspace';

export type SandboxFileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

export type SandboxFileContent = {
  content: Buffer;
  contentType: string;
  fileName: string;
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
  const entries = await sandbox.provider.listDirectory(dirPath);
  const workspaceRoot = sandbox.workspaceRoot;
  const files: SandboxFileEntry[] = [];
  for (const entry of entries) {
    if (
      !entry.name ||
      entry.name === '.' ||
      entry.name.includes('/') ||
      (!entry.isFile && !entry.isDirectory)
    ) {
      throw new Error('Invalid Sandbox directory entry');
    }
    const entryPath = resolveSandboxWorkspacePath({ workspaceRoot, path: entry.path });
    const expectedPath = resolveSandboxWorkspacePath({
      workspaceRoot,
      path: posix.join(dirPath, entry.name)
    });
    if (entryPath !== expectedPath || posix.dirname(entryPath) !== dirPath) {
      throw new Error('Invalid Sandbox directory entry');
    }
    await assertSandboxWorkspacePath({
      provider: sandbox.provider,
      workspaceRoot: sandbox.workspaceRoot,
      path: entryPath
    });
    files.push({
      name: entry.name,
      path: entryPath,
      type: entry.isDirectory ? 'directory' : 'file',
      size: entry.isFile ? entry.size : undefined
    });
  }
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
  content: string
): Promise<void> {
  const safePath = await assertSandboxWorkspacePath({
    provider: sandbox.provider,
    workspaceRoot: sandbox.workspaceRoot,
    path,
    allowMissing: true
  });
  const results = await sandbox.provider.writeFiles([{ path: safePath, data: content }]);
  const result = results[0];
  if (!result) throw new Error('Missing Sandbox file result');
  if (result.error) {
    return Promise.reject(result.error);
  }
  assertProviderResultPath({ sandbox, expectedPath: safePath, returnedPath: result.path });
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
  const results = await sandbox.provider.readFiles([safePath]);
  const result = results[0];
  if (!result) throw new Error('Missing Sandbox file result');
  if (result.error) {
    return Promise.reject(new Error(`Failed to read file: ${result.error.message}`));
  }
  assertProviderResultPath({ sandbox, expectedPath: safePath, returnedPath: result.path });

  const fileName = path.split('/').pop() || 'file';
  // 注意：preview 模式下 contentType 由文件路径决定，可能返回 text/html / image/svg+xml 等危险类型。
  // 若未来有任何代码让浏览器直接导航到 download 端点（iframe / window.open 等），需确保这类内容不被同源渲染，否则会造成存储型 XSS。
  const contentType = preview
    ? mime.getType(path) ?? 'application/octet-stream'
    : 'application/octet-stream';

  return {
    content: Buffer.from(result.content),
    contentType,
    fileName
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
