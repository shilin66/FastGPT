import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { z } from 'zod';
import { resolveSandboxWorkspacePath } from './workspace';
import { UserError } from '@fastgpt/global/common/error/utils';

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
const resultSchema = z.object({
  type: z.enum(['text', 'binary']),
  content: z.string(),
  size: z.number(),
  startLine: z.number(),
  truncated: z.boolean()
});
const script = `import os, sys, stat, json, codecs
arg = json.loads(sys.argv[1])
parent = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
try:
    for part in os.path.dirname(arg['path']).strip('/').split('/'):
        child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        os.close(parent)
        parent = child
    fd = os.open(os.path.basename(arg['path']), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1: raise ValueError('workspace_unsafe_file')
        header = source.read(4096)
        binary = b'\\0' in header
        try: codecs.getincrementaldecoder('utf-8')().decode(header, final=False)
        except UnicodeDecodeError: binary = True
        source.seek(0)
        content = b''
        if not binary:
            line = 1
            scanned = 0
            while line < arg['startLine']:
                block = source.readline(65536)
                if not block: break
                scanned += len(block)
                if scanned > 4194304: raise ValueError('workspace_read_range_too_far')
                if block.endswith(b'\\n'): line += 1
            for _ in range(arg['maxLines']):
                room = 16384 - len(content)
                if room <= 0: break
                block = source.readline(room)
                if not block: break
                content += block
            if b'\\0' in content: binary = True
            try: text = codecs.getincrementaldecoder('utf-8')().decode(content, final=False)
            except UnicodeDecodeError: binary = True
        after = os.fstat(source.fileno())
        if (info.st_ino, info.st_mtime_ns, info.st_size) != (after.st_ino, after.st_mtime_ns, after.st_size): raise ValueError('workspace_file_conflict')
        print(json.dumps({'type': 'binary' if binary else 'text', 'content': '' if binary else text,
            'size': info.st_size, 'startLine': arg['startLine'], 'truncated': not binary and source.tell() < info.st_size}))
except (OSError, ValueError) as error:
    code = str(error)
    print(json.dumps({'error': code if code.startswith('workspace_') else 'workspace_file_unavailable'}))
finally: os.close(parent)
`;

export const readSandboxTextRange = async ({
  provider,
  workspaceRoot,
  path,
  startLine = 1,
  maxLines = 200
}: {
  provider: Pick<ISandbox, 'execute'>;
  workspaceRoot: string;
  path: string;
  startLine?: number;
  maxLines?: number;
}) => {
  const args = {
    path: resolveSandboxWorkspacePath({ workspaceRoot, path }),
    startLine: z.number().int().min(1).max(100000).parse(startLine),
    maxLines: z.number().int().min(1).max(1000).parse(maxLines)
  };
  const result = await provider.execute(
    ['python3', '-c', script, JSON.stringify(args)].map(quote).join(' '),
    { timeoutMs: 10000, maxOutputBytes: 131072 }
  );
  if (result.exitCode !== 0) throw new UserError('workspace_file_unavailable');
  const response: unknown = JSON.parse(result.stdout);
  if (
    response &&
    typeof response === 'object' &&
    'error' in response &&
    typeof response.error === 'string'
  )
    throw new UserError(response.error);
  return resultSchema.parse(response);
};
