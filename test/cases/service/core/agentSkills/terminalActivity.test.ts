import { describe, expect, it, vi } from 'vitest';
import { assertSkillTerminalIdle } from '@fastgpt/service/core/ai/sandbox/terminal';

describe('Skill Terminal publish guard', () => {
  const probe = (stdout: string, exitCode = 0) => ({
    execute: vi.fn(async () => ({ stdout, stderr: '', exitCode }))
  });

  it('allows infrastructure and a sleeping interactive shell without jobs', async () => {
    await expect(
      assertSkillTerminalIdle(
        probe(
          '1 0 1 -1 ? Ss bootstrap.sh\n15 1 1 -1 ? Sl node\n80 15 80 80 pts/0 Ss+ bash\n90 15 90 -1 ? R ps'
        )
      )
    ).resolves.toBeUndefined();
  });

  it.each([
    '80 15 80 81 pts/0 Ss bash\n81 80 81 81 pts/0 S+ sleep',
    '80 15 80 80 pts/0 Ss+ bash\n81 80 81 80 pts/0 S python3',
    '80 15 80 80 pts/0 Rs+ bash',
    '80 15 80 80 pts/0 Ss+ python3'
  ])('refuses foreground, background and interactive jobs: %s', async (stdout) => {
    await expect(assertSkillTerminalIdle(probe(stdout))).rejects.toThrow('workspace_terminal_busy');
  });

  it('fails closed if activity cannot be determined', async () => {
    await expect(assertSkillTerminalIdle(probe(''))).rejects.toThrow(
      'workspace_terminal_probe_failed'
    );
    await expect(assertSkillTerminalIdle(probe('unexpected result'))).rejects.toThrow(
      'workspace_terminal_probe_failed'
    );
    await expect(assertSkillTerminalIdle(probe('', 1))).rejects.toThrow(
      'workspace_terminal_probe_failed'
    );
  });
});
