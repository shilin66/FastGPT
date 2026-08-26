export const simpleConfigSectionIds = {
  overview: 'simple-config-overview',
  model: 'simple-config-model',
  dataset: 'simple-config-dataset',
  tools: 'simple-config-tools',
  interaction: 'simple-config-interaction',
  runtime: 'simple-config-runtime'
} as const;

export type SimpleConfigSectionKey = keyof typeof simpleConfigSectionIds;
