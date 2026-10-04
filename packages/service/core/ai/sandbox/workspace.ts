import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { posix } from 'node:path';
import { createHash } from 'node:crypto';

export const getSandboxSessionDirectory = (workspaceRoot: string, chatId: string): string => {
  if (!chatId) throw new Error('Sandbox session requires a chatId');
  const segment =
    /^[a-zA-Z0-9_-]{1,128}$/.test(chatId) && !chatId.startsWith('encoded-')
      ? chatId
      : `encoded-${createHash('sha256').update(chatId).digest('hex')}`;
  return resolveSandboxWorkspacePath({ workspaceRoot, path: `sessions/${segment}` });
};

export const prepareSandboxSessionDirectory = async (
  provider: Pick<ISandbox, 'execute'>,
  workspaceRoot: string,
  directory: string
) => {
  const safePath = resolveSandboxWorkspacePath({ workspaceRoot, path: directory });
  const script = `import os, sys
root, relative = sys.argv[1:]
fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    for part in relative.split('/'):
        if not part or part in ('.', '..'): raise ValueError('Invalid session path')
        try: os.mkdir(part, mode=0o700, dir_fd=fd)
        except FileExistsError: pass
        next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        os.close(fd)
        fd = next_fd
finally: os.close(fd)
`;
  const result = await provider.execute(
    ['python3', '-c', script, workspaceRoot, posix.relative(workspaceRoot, safePath)]
      .map(quoteShellArgument)
      .join(' '),
    { timeoutMs: 10_000 }
  );
  if (result.exitCode !== 0) throw new Error('Unable to prepare Sandbox session directory');
};

const invalidPath = () => new Error('Invalid Sandbox workspace path');

const assertPathText = (path: string) => {
  // The current SDK's shell polyfill only escapes double quotes. Reject shell expansion
  // characters until the provider supports them safely, including in returned paths.
  if (/[\u0000-\u001f\u007f\\$`]/.test(path) || path.split('/').includes('..')) {
    throw invalidPath();
  }
};

const validateWorkspaceRoot = (workspaceRoot: string): string => {
  assertPathText(workspaceRoot);
  const root = posix.normalize(workspaceRoot);
  if (!posix.isAbsolute(root) || root === '/') throw invalidPath();
  return root.replace(/\/+$/, '');
};

export const getSandboxWorkspaceRoot = (provider: Pick<ISandbox, 'execute'>): string => {
  // All installed adapters expose rootPath; it also determines their default command cwd.
  if (!('rootPath' in provider) || typeof provider.rootPath !== 'string') {
    throw new Error('Sandbox provider does not expose a workspace root');
  }
  return validateWorkspaceRoot(provider.rootPath);
};

export const resolveSandboxWorkspacePath = ({
  workspaceRoot,
  path
}: {
  workspaceRoot: string;
  path: string;
}): string => {
  const root = validateWorkspaceRoot(workspaceRoot);
  assertPathText(path);
  const resolved = posix.resolve(root, path || '.');
  // Editor lists absolute paths and sends them back unchanged, so retain in-root absolutes.
  if (resolved !== root && !resolved.startsWith(`${root}/`)) throw invalidPath();
  return resolved;
};

export const resolveSandboxToolPath = ({
  workspaceRoot,
  workingDirectory = workspaceRoot,
  path
}: {
  workspaceRoot: string;
  workingDirectory?: string;
  path: string;
}): string => {
  const cwd = resolveSandboxWorkspacePath({ workspaceRoot, path: workingDirectory });
  const cwdWithoutSlash = cwd.slice(1);
  // Models sometimes remove the leading slash from the cwd shown in the prompt.
  // An explicit ./ prefix retains access to intentional or historical nested paths.
  const target =
    path === cwdWithoutSlash || path.startsWith(`${cwdWithoutSlash}/`)
      ? `/${path}`
      : path.startsWith('/')
        ? path
        : `${cwd}/${path || '.'}`;
  return resolveSandboxWorkspacePath({ workspaceRoot, path: target });
};

const quoteShellArgument = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

const checkWorkspacePathScript = `import json, os, stat, sys
from pathlib import Path
root, targets_json, allow_missing = sys.argv[1:]
try:
    targets = json.loads(targets_json)
    if not isinstance(targets, list) or not targets or not all(isinstance(target, str) for target in targets):
        raise ValueError()
    real_root = str(Path(root).resolve(strict=True))
    if not os.path.isdir(real_root):
        raise ValueError()
    for target in targets:
        current = root
        for part in os.path.relpath(target, root).split(os.sep):
            if part == '.':
                continue
            current = os.path.join(current, part)
            try:
                info = os.lstat(current)
            except FileNotFoundError:
                if allow_missing == 'true':
                    break
                raise
            resolved = str(Path(current).resolve(strict=True))
            if os.path.commonpath([real_root, resolved]) != real_root:
                raise ValueError()
            if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode)):
                raise ValueError()
            resolved_info = os.stat(current)
            if not (stat.S_ISREG(resolved_info.st_mode) or stat.S_ISDIR(resolved_info.st_mode)):
                raise ValueError()
        if os.path.commonpath([real_root, os.path.realpath(target)]) != real_root:
            raise ValueError()
except (OSError, ValueError):
    sys.exit(1)
print('FASTGPT_WORKSPACE_PATH_OK')`;

const validateWorkspacePaths = async ({
  provider,
  workspaceRoot,
  paths,
  allowMissing = false
}: {
  provider: Pick<ISandbox, 'execute'>;
  workspaceRoot: string;
  paths: string[];
  allowMissing?: boolean;
}) => {
  const command = [
    'python3',
    '-c',
    checkWorkspacePathScript,
    workspaceRoot,
    JSON.stringify(paths),
    String(allowMissing)
  ]
    .map(quoteShellArgument)
    .join(' ');
  const result = await provider.execute(command, { timeoutMs: 10000 });
  if (result.exitCode !== 0 || result.stdout.trim() !== 'FASTGPT_WORKSPACE_PATH_OK') {
    throw invalidPath();
  }
};

export const assertSandboxWorkspacePath = async ({
  provider,
  workspaceRoot = getSandboxWorkspaceRoot(provider),
  path,
  allowMissing = false
}: {
  provider: Pick<ISandbox, 'execute'>;
  workspaceRoot?: string;
  path: string;
  allowMissing?: boolean;
}): Promise<string> => {
  const root = validateWorkspaceRoot(workspaceRoot);
  const resolvedPath = resolveSandboxWorkspacePath({ workspaceRoot: root, path });
  await validateWorkspacePaths({
    provider,
    workspaceRoot: root,
    paths: [resolvedPath],
    allowMissing
  });
  // This guards current symlinks but is not an atomic open: a concurrently running process
  // may still replace a path between this check and the provider's subsequent file operation.
  return resolvedPath;
};

export const assertSandboxWorkspacePaths = async ({
  provider,
  workspaceRoot = getSandboxWorkspaceRoot(provider),
  paths
}: {
  provider: Pick<ISandbox, 'execute'>;
  workspaceRoot?: string;
  paths: string[];
}): Promise<string[]> => {
  const root = validateWorkspaceRoot(workspaceRoot);
  const resolvedPaths = paths.map((path) =>
    resolveSandboxWorkspacePath({ workspaceRoot: root, path })
  );
  const validationBatchSize = 256;
  for (let index = 0; index < resolvedPaths.length; index += validationBatchSize) {
    await validateWorkspacePaths({
      provider,
      workspaceRoot: root,
      paths: resolvedPaths.slice(index, index + validationBatchSize)
    });
  }
  return resolvedPaths;
};
