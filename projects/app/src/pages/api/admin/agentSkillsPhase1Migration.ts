import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  auditAgentSkillsPhase1,
  backfillAgentSkillsPhase1
} from '@fastgpt/service/core/agentSkills/migration/phase1';
import { UserError } from '@fastgpt/global/common/error/utils';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { z } from 'zod';

const AgentSkillsPhase1MigrationBodySchema = z.object({
  mode: z.enum(['dry-run', 'backfill']).default('dry-run'),
  cursor: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  batchSize: z.number().int().min(1).max(500).default(100),
  confirmWrite: z.boolean().default(false),
  includeGlobalReferences: z.boolean().optional()
});
type AgentSkillsPhase1MigrationBody = z.input<typeof AgentSkillsPhase1MigrationBodySchema>;

async function handler(req: ApiRequestProps<AgentSkillsPhase1MigrationBody>) {
  await authSystemAdmin({ req });

  const { mode, cursor, batchSize, confirmWrite, includeGlobalReferences } =
    AgentSkillsPhase1MigrationBodySchema.parse(req.body ?? {});

  if (mode === 'backfill') {
    if (!confirmWrite) throw new UserError(SkillErrEnum.migrationConflict);
    return backfillAgentSkillsPhase1({ cursor, batchSize });
  }

  return auditAgentSkillsPhase1({
    cursor,
    batchSize,
    includeGlobalReferences
  });
}

export default NextAPI(handler);
