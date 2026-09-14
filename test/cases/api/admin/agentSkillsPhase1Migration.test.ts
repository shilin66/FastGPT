import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/admin/agentSkillsPhase1Migration';
import { getRootUser } from '@test/datas/users';

describe('POST /api/admin/agentSkillsPhase1Migration', () => {
  it('uses dry-run mode by default', async () => {
    const auth = await getRootUser();
    const result = await handler({ method: 'POST', auth, body: {} }, {});

    expect(result.code).toBe(200);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.migrationKey).toBe('agent-skills-phase1-v2');
  });

  it('requires explicit write confirmation for backfill', async () => {
    const auth = await getRootUser();
    const result = await handler({ method: 'POST', auth, body: { mode: 'backfill' } }, {});

    expect(result.code).toBe(500);
    expect(result.error).toMatchObject({ message: 'migrationConflict' });
  });
});
