import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getExistingSandboxClient } from './controller';
import type { SandboxInstanceSchemaType } from './type';
import { disconnectFromProviderSandbox } from '../../agentSkills/sandboxConfig';

export class SkillTerminalActivityError extends UserError {
  constructor(readonly reason: 'busy' | 'probe_failed') {
    super(`skill:workspace_terminal_${reason}`);
  }
}

export const assertSkillWorkspaceTerminalIdle = async (instance: SandboxInstanceSchemaType) => {
  const provider = getExistingSandboxClient(instance).provider;
  try {
    if (
      !('connectExisting' in provider) ||
      typeof provider.connectExisting !== 'function' ||
      !(await provider.connectExisting()) ||
      (await provider.getInfo())?.status.state !== 'Running'
    ) {
      throw new SkillTerminalActivityError('probe_failed');
    }
    await assertSkillTerminalIdle(provider);
  } finally {
    await disconnectFromProviderSandbox(provider);
  }
};

export const assertSkillTerminalIdle = async (provider: Pick<ISandbox, 'execute'>) => {
  const result = await provider.execute('ps -eo pid=,ppid=,pgid=,tpgid=,tty=,stat=,comm=', {
    timeoutMs: 5000,
    maxOutputBytes: 262144
  });
  const rows = result.stdout.trim().split('\n');
  if (
    result.exitCode !== 0 ||
    !result.stdout.trim() ||
    Buffer.byteLength(result.stdout) >= 262144
  ) {
    throw new SkillTerminalActivityError('probe_failed');
  }
  const processes = rows.map((row) => {
    const match = row.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!match) throw new SkillTerminalActivityError('probe_failed');
    return {
      pid: match[1],
      parent: match[2],
      group: match[3],
      foreground: match[4],
      tty: match[5],
      state: match[6],
      name: match[7]
    };
  });
  const live = processes.filter((process) => !process.state.startsWith('Z'));
  const parents = new Set(live.map((process) => process.parent));
  const busy = live.some((process) => {
    if (process.tty === '?') return false;
    const idleShell =
      /^(?:ba|da|z|k|fi)?sh$/.test(process.name) &&
      process.state.startsWith('S') &&
      process.group === process.foreground &&
      !parents.has(process.pid);
    return !idleShell;
  });
  if (busy) throw new SkillTerminalActivityError('busy');
};
