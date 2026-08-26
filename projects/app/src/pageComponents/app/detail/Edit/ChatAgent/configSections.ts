export const agentConfigSectionIds = {
  overview: 'agent-config-overview',
  model: 'agent-config-model',
  dataset: 'agent-config-dataset',
  tools: 'agent-config-tools',
  interaction: 'agent-config-interaction',
  runtime: 'agent-config-runtime'
} as const;

export type AgentConfigSectionKey = keyof typeof agentConfigSectionIds;
