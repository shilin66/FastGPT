import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      `${key}${options?.name ? ` ${options.name}` : ''}`
  })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ reRankModelList: [{ model: 'rerank' }] })
}));
vi.mock('@/web/common/system/utils', () => ({ getWebLLMModel: () => ({ name: 'Qwen' }) }));

import AgentDatasetConfig from '@/pageComponents/app/detail/Edit/FormComponent/AgentDatasetConfig';

let root: Root;
let container: HTMLDivElement;
const dataset: AppFormEditFormType['dataset'] = {
  datasets: [{ datasetId: 'knowledge-1', name: '研发知识库', avatar: '' }],
  searchMode: DatasetSearchModeEnum.embedding,
  limit: 3000,
  similarity: 0.4,
  usingReRank: true,
  datasetSearchUsingExtensionQuery: true,
  datasetSearchExtensionModel: 'qwen'
};
const actions = {
  onOpenParams: vi.fn(),
  onOpenSelect: vi.fn(),
  onRemove: vi.fn()
};
const render = (value = dataset) =>
  act(async () =>
    root.render(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(AgentDatasetConfig, { dataset: value, ...actions })
      )
    )
  );
const button = (name: string) => {
  const element = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === name || item.getAttribute('aria-label') === name
  );
  if (!element) throw new Error(`Missing button: ${name}`);
  return element;
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Agent knowledge configuration', () => {
  it('renders retrieval values as a definition list and keeps controls accessible', async () => {
    await render();
    expect(container.querySelector('table')).toBeNull();
    const summary = container.querySelector('dl');
    expect(summary?.textContent).toContain('3,000');
    expect(summary?.textContent).toContain('0.4');
    expect(summary?.textContent).toContain('Qwen');
    expect(summary?.textContent).toContain('app:agent_config_feature_enabled');
    await act(async () => button('app:agent_config_dataset_params').click());
    await act(async () => button('app:agent_config_dataset_select').click());
    const view = container.querySelector(
      'a[aria-label="app:agent_config_dataset_view 研发知识库"]'
    );
    expect(view?.getAttribute('href')).toBe('/dataset/detail?datasetId=knowledge-1');
    expect(view?.getAttribute('target')).toBe('_blank');
    expect(view?.getAttribute('rel')).toBe('noopener noreferrer');
    await act(async () => button('app:agent_config_dataset_remove 研发知识库').click());
    expect(actions.onOpenParams).toHaveBeenCalledOnce();
    expect(actions.onOpenSelect).toHaveBeenCalledOnce();
    expect(actions.onRemove).toHaveBeenCalledWith('knowledge-1');
  });

  it('shows a useful empty state after the last knowledge base is removed', async () => {
    await render();
    await render({ ...dataset, datasets: [] });
    expect(container.querySelector('dl')).toBeNull();
    expect(container.textContent).toContain('app:No_selected_dataset');
    expect(container.textContent).toContain('app:agent_config_dataset_empty_desc');
    expect(button('app:agent_config_dataset_select').disabled).toBe(false);
  });

  it('shows unsupported similarity and disabled extensions explicitly', async () => {
    await render({
      ...dataset,
      searchMode: DatasetSearchModeEnum.fullTextRecall,
      usingReRank: false,
      datasetSearchUsingExtensionQuery: false
    });
    expect(container.querySelector('dl')?.textContent).toContain(
      'common:core.dataset.search.Nonsupport'
    );
    expect(container.querySelector('dl')?.textContent).toContain(
      'app:agent_config_feature_disabled'
    );
  });
});
