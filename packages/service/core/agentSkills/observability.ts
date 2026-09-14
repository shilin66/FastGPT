import { getMeter } from '../../common/metrics';

const meter = getMeter('fastgpt.agent_skills');
const operationCounter = meter.createCounter('fastgpt.agent_skills.operation.count', {
  description: 'Agent Skill service operations'
});
const migrationConflictCounter = meter.createCounter(
  'fastgpt.agent_skills.migration.conflict.count',
  { description: 'Agent Skill migration conflicts grouped by kind' }
);

export function recordAgentSkillOperation({
  operation,
  status
}: {
  operation: string;
  status: 'ok' | 'error' | 'conflict';
}) {
  operationCounter.add(1, { operation, status });
}

export function recordAgentSkillMigrationConflict(kind: string) {
  migrationConflictCounter.add(1, { kind });
}
