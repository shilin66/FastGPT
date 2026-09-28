import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Types } from '@fastgpt/service/common/mongo';
import {
  executeWorkspaceCommand,
  WorkspaceCommandOutcomeUnknown
} from '@fastgpt/service/core/ai/sandbox/command';
import { loadSkillCreator, syncSkillCreator } from '@fastgpt/service/core/agentSkills/builtin';
import {
  withSkillDebugRun,
  getSkillDebugRunStatus
} from '@fastgpt/service/core/agentSkills/debugRun';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { operateSkillWorkspaceFiles } from '@fastgpt/service/core/agentSkills/editWorkspace/files';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { readSandboxTextRange } from '@fastgpt/service/core/ai/sandbox/text';
import type { SandboxLease } from '@fastgpt/service/core/ai/sandbox/lease';

const { locks } = vi.hoisted(() => ({ locks: new Set<string>() }));
vi.mock('@fastgpt/service/core/ai/sandbox/lease', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/lease')>();
  return {
    ...actual,
    withSandboxLease: async (key: string, run: (lease: SandboxLease) => Promise<unknown>) => {
      if (locks.has(key)) throw new actual.SandboxOperationConflict();
      locks.add(key);
      try {
        return await run({
          token: key,
          isActive: () => true,
          assertOwned: async () => {},
          setHeartbeat: () => {}
        });
      } finally {
        locks.delete(key);
      }
    }
  };
});

const shell = promisify(execFile);
const directories: string[] = [];
const workspace = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'skill-creator-test-')));
  directories.push(root);
  return root;
};
const localProvider = (
  home?: string
): Parameters<typeof executeWorkspaceCommand>[0]['provider'] => ({
  execute: async (command) => {
    try {
      const result = await shell('/bin/sh', ['-c', command], {
        maxBuffer: 1024 * 1024,
        env: { ...process.env, ...(home && { HOME: home }) }
      });
      return { ...result, exitCode: 0 };
    } catch (error) {
      return { stdout: '', stderr: error instanceof Error ? error.message : 'failed', exitCode: 1 };
    }
  },
  writeFiles: async (entries) =>
    Promise.all(
      entries.map(async (entry) => {
        if (!(entry.data instanceof Uint8Array)) throw new Error('Unexpected control data');
        await writeFile(entry.path, entry.data);
        return { path: entry.path, error: null, bytesWritten: entry.data.byteLength };
      })
    )
});
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('Skill Creator injection and supervised commands', () => {
  it('never launches a command after cancellation during preparation', async () => {
    const root = await workspace();
    const provider = localProvider();
    let stopped = false;
    const execute = provider.execute;
    provider.execute = async (...args) => {
      const result = await execute(...args);
      if (args[0].includes('control.json')) stopped = true;
      return result;
    };
    await expect(
      executeWorkspaceCommand({
        provider,
        workspaceRoot: root,
        command: 'touch launched',
        shouldStop: () => stopped
      })
    ).rejects.toThrow('cancelled');
    await expect(readFile(`${root}/launched`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('treats a lost execution response as unknown, not as a retryable shell failure', async () => {
    const root = await workspace();
    const provider = localProvider();
    const execute = provider.execute;
    provider.execute = async (...args) => {
      if (args[0].includes('subprocess.Popen')) throw new Error('Provider response lost');
      return execute(...args);
    };
    await expect(
      executeWorkspaceCommand({ provider, workspaceRoot: root, command: 'true' })
    ).rejects.toBeInstanceOf(WorkspaceCommandOutcomeUnknown);
  });

  it('loads owned rules, preserves state and repairs modified builtin files', async () => {
    const home = await workspace();
    const provider = localProvider(home);
    const resource = await loadSkillCreator();
    const legacyRoot = `${home}/.fastgpt/skills/skill-creator`;
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(`${legacyRoot}/SKILL.md`, 'legacy instructions');
    const first = await syncSkillCreator(provider);
    expect(first.root).toBe(`${home}/.omni/skills/skill-creator`);
    expect(first.path).toBe(`${first.root}/SKILL.md`);
    expect(await readFile(first.path, 'utf8')).toBe(resource.content);
    expect(await readFile(`${legacyRoot}/SKILL.md`, 'utf8')).toBe('legacy instructions');
    const state = `${home}/.fastgpt/runtime/state.json`;
    await writeFile(
      state,
      JSON.stringify({ unrelated: 'preserved', 'builtinSkill:skill-creator': resource.hash })
    );
    await writeFile(first.path, 'corrupted instructions');
    await syncSkillCreator(provider);
    expect(await readFile(first.path, 'utf8')).toBe(resource.content);
    expect(JSON.parse(await readFile(state, 'utf8')).unrelated).toBe('preserved');
  });

  it('returns real success, nonzero exits and bounded output with readable logs', async () => {
    const root = await workspace();
    const provider = localProvider();
    const result = await executeWorkspaceCommand({
      provider,
      workspaceRoot: root,
      command: 'python3 -c \'print("x" * 20000)\''
    });
    expect(result).toMatchObject({ reason: 'completed', exitCode: 0, truncated: true });
    expect(result.stdout.length).toBeLessThanOrEqual(8192);
    expect((await readFile(`${result.logDirectory}/stdout.log`)).length).toBe(20001);
    expect(
      await executeWorkspaceCommand({ provider, workspaceRoot: root, command: 'exit 7' })
    ).toMatchObject({ reason: 'failed', exitCode: 7 });
  });

  it.each(['timeout', 'cancel'] as const)(
    'terminates the process group on %s without delayed writes',
    async (mode) => {
      const root = await workspace();
      let stopped = false;
      const timer = setTimeout(() => {
        stopped = true;
      }, 200);
      try {
        const result = await executeWorkspaceCommand({
          provider: localProvider(),
          workspaceRoot: root,
          command: '(sleep 1.5; touch late-write) & wait',
          timeoutMs: mode === 'timeout' ? 200 : 10000,
          shouldStop: () => mode === 'cancel' && stopped
        });
        expect(result.reason).toBe(mode === 'timeout' ? 'timed_out' : 'cancelled');
        await new Promise((resolve) => setTimeout(resolve, 1700));
        await expect(readFile(`${root}/late-write`)).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        clearTimeout(timer);
      }
    }
  );
});

describe('Skill round idempotency', () => {
  const identity = () => ({
    skillId: new Types.ObjectId().toHexString(),
    teamId: new Types.ObjectId().toHexString(),
    tmbId: new Types.ObjectId().toHexString(),
    chatId: 'test-chat',
    requestId: 'test-round',
    stopped: () => false
  });

  it('reports persisted terminal status and only marks expired unowned runs interrupted', async () => {
    const args = identity();
    await withSkillDebugRun({
      ...args,
      run: async () => {
        await MongoChatItem.updateMany(
          { appId: args.skillId },
          { $set: { 'execution.updatedAt': new Date(0) } }
        );
        expect(await getSkillDebugRunStatus(args)).toEqual({
          status: 'running',
          workspaceRunning: true
        });
        return 'completed';
      }
    });
    expect(await getSkillDebugRunStatus(args)).toEqual({
      status: 'completed',
      workspaceRunning: false
    });
    await MongoChatItem.updateMany(
      { appId: args.skillId },
      { $set: { 'execution.status': 'running', 'execution.updatedAt': new Date(0) } }
    );
    expect(await getSkillDebugRunStatus(args)).toEqual({
      status: 'interrupted',
      workspaceRunning: false
    });
    expect(
      await getSkillDebugRunStatus({ ...args, teamId: new Types.ObjectId().toHexString() })
    ).toEqual({ status: 'idle', workspaceRunning: false });
  });

  it('executes and charges a repeated request only once and keeps execution records hidden', async () => {
    const args = identity();
    const run = vi.fn(async () => 'completed' as const);
    await withSkillDebugRun({ ...args, run });
    await expect(withSkillDebugRun({ ...args, run })).rejects.toThrow('already_submitted');
    expect(run).toHaveBeenCalledOnce();
    expect(await MongoChatItem.findOne({ appId: args.skillId }).lean()).toMatchObject({
      hideInUI: true,
      execution: { status: 'completed' }
    });
    const chat = new MongoChatItem({ ...args, obj: ChatRoleEnum.Human, value: [] });
    expect(chat.toObject().execution).toBeUndefined();
  });

  it('rejects another tab while a round owns the workspace and records stops', async () => {
    const args = identity();
    await withSkillDebugRun({
      ...args,
      stopped: () => true,
      run: async (shouldStop) => {
        expect(shouldStop()).toBe(true);
        await expect(
          withSkillDebugRun({ ...args, requestId: 'other', run: async () => 'completed' })
        ).rejects.toThrow('operation_conflict');
        return 'completed';
      }
    });
    expect(await MongoChatItem.findOne({ appId: args.skillId }).lean()).toMatchObject({
      execution: { status: 'stopped' }
    });
  });
});

describe('Skill editor file synchronization', () => {
  it('reads bounded line ranges and identifies binary content without decoding it as text', async () => {
    const root = await workspace();
    const provider = localProvider();
    await writeFile(
      `${root}/large.log`,
      Array.from({ length: 500 }, (_, index) => `line ${index + 1}\n`).join('')
    );
    expect(
      await readSandboxTextRange({
        provider,
        workspaceRoot: root,
        path: 'large.log',
        startLine: 20,
        maxLines: 2
      })
    ).toMatchObject({ type: 'text', content: 'line 20\nline 21\n', truncated: true });
    await writeFile(`${root}/one-line.log`, 'x'.repeat(1000000));
    const long = await readSandboxTextRange({
      provider,
      workspaceRoot: root,
      path: 'one-line.log'
    });
    expect(long.type).toBe('text');
    expect(long.content.length).toBeLessThanOrEqual(16384);
    expect(long.truncated).toBe(true);
    await writeFile(`${root}/data.bin`, Buffer.from([0, 255, 0, 10]));
    expect(
      await readSandboxTextRange({ provider, workspaceRoot: root, path: 'data.bin' })
    ).toMatchObject({ type: 'binary', content: '' });
    await writeFile(
      `${root}/late-null.bin`,
      Buffer.concat([Buffer.alloc(5000, 65), Buffer.from([0])])
    );
    expect(
      await readSandboxTextRange({ provider, workspaceRoot: root, path: 'late-null.bin' })
    ).toMatchObject({ type: 'binary', content: '' });
    await symlink('/etc/hosts', `${root}/outside`);
    await expect(
      readSandboxTextRange({ provider, workspaceRoot: root, path: 'outside' })
    ).rejects.toThrow('workspace_file_unavailable');
  });
  it('lists real files and refuses stale edits and symlink escapes', async () => {
    const root = await workspace();
    const provider = localProvider();
    const skillId = new Types.ObjectId().toHexString();
    await mkdir(`${root}/skills/demo`, { recursive: true });
    await writeFile(`${root}/skills/demo/SKILL.md`, 'draft');
    const operate = (request: Parameters<typeof operateSkillWorkspaceFiles>[0]['request']) =>
      operateSkillWorkspaceFiles({ provider, workspaceRoot: root, request });
    const listed = await operate({ skillId, action: 'list' });
    expect(listed.action === 'list' && listed.files.map((file) => file.path)).toContain(
      'skills/demo/SKILL.md'
    );
    const read = await operate({ skillId, action: 'read', path: 'skills/demo/SKILL.md' });
    if (read.action !== 'read') throw new Error('Missing file');
    await writeFile(`${root}/skills/demo/SKILL.md`, 'Agent changed this');
    await expect(
      operate({
        skillId,
        action: 'write',
        path: read.path,
        expectedHash: read.hash,
        content: 'old editor buffer'
      })
    ).rejects.toThrow('workspace_file_conflict');
    expect(await readFile(`${root}/skills/demo/SKILL.md`, 'utf8')).toBe('Agent changed this');
    const fresh = await operate({ skillId, action: 'read', path: read.path });
    if (fresh.action !== 'read') throw new Error('Missing file');
    await operate({
      skillId,
      action: 'write',
      path: fresh.path,
      expectedHash: fresh.hash,
      content: 'saved edit'
    });
    expect(await readFile(`${root}/skills/demo/SKILL.md`, 'utf8')).toBe('saved edit');
    await symlink('/etc/hosts', `${root}/skills/leak`);
    await expect(operate({ skillId, action: 'read', path: 'skills/leak' })).rejects.toThrow(
      'workspace_file_unavailable'
    );
    await expect(operate({ skillId, action: 'read', path: '../outside' })).rejects.toThrow(
      'Invalid Sandbox workspace path'
    );
  });
});
