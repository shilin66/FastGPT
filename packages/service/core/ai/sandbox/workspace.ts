import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { posix } from 'node:path';

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

const quoteShellArgument = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

const checkWorkspacePathScript = `import os, stat, sys
from pathlib import Path
root, target, allow_missing = sys.argv[1:]
try:
    real_root = str(Path(root).resolve(strict=True))
    if not os.path.isdir(real_root):
        raise ValueError()
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
  const command = [
    'python3',
    '-c',
    checkWorkspacePathScript,
    root,
    resolvedPath,
    String(allowMissing)
  ]
    .map(quoteShellArgument)
    .join(' ');
  const result = await provider.execute(command, { timeoutMs: 10000 });
  if (result.exitCode !== 0 || result.stdout.trim() !== 'FASTGPT_WORKSPACE_PATH_OK') {
    throw invalidPath();
  }
  // This guards current symlinks but is not an atomic open: a concurrently running process
  // may still replace a path between this check and the provider's subsequent file operation.
  return resolvedPath;
};
