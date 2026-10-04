export const simpleConfigSectionIds = {
  overview: 'simple-config-overview',
  model: 'simple-config-model',
  dataset: 'simple-config-dataset',
  tools: 'simple-config-tools',
  runtime: 'simple-config-runtime',
  interaction: 'simple-config-interaction'
} as const;

export type SimpleConfigSectionKey = keyof typeof simpleConfigSectionIds;
