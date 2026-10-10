import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';

const state = vi.hoisted(() => ({ parentId: '', searchKey: '' }));
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const chakra = await importOriginal<typeof import('@chakra-ui/react')>();
  return { ...chakra, ModalBody: chakra.Box, ModalFooter: chakra.Flex };
});
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; name?: string }) =>
      `${key}${options?.count !== undefined ? ` ${options.count}` : ''}${options?.name ? ` ${options.name}` : ''}`
  })
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: React.ReactNode }) =>
    React.createElement('section', { role: 'dialog' }, title, children)
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({
  default: ({ text }: { text: string }) => React.createElement('p', null, text)
}));
vi.mock('@/components/common/folder/Path', () => ({
  default: ({
    paths,
    onClick
  }: {
    paths: { parentId: string; parentName: string }[];
    onClick: (id: string) => void;
  }) =>
    React.createElement(
      'div',
      null,
      React.createElement('button', { onClick: () => onClick('') }, 'Root'),
      ...paths.map((p) =>
        React.createElement(
          'button',
          { key: p.parentId, onClick: () => onClick(p.parentId) },
          p.parentName
        )
      )
    )
}));
vi.mock('@/pageComponents/app/detail/components/QuickCreateDatasetModal', () => ({
  default: () => null
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: undefined })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/core/dataset/SelectModal', () => ({
  useDatasetSelect: () => ({
    paths: [],
    parentId: state.parentId,
    searchKey: state.searchKey,
    setParentId: (id: string) => {
      state.parentId = id;
    },
    setSearchKey: (key: string) => {
      state.searchKey = key;
    },
    isFetching: false,
    loadDatasets: vi.fn(),
    datasets: [
      {
        _id: 'a',
        name: 'Knowledge A',
        avatar: '',
        type: DatasetTypeEnum.dataset,
        vectorModel: { model: 'embedding-a', name: 'Embedding A' }
      },
      {
        _id: 'b',
        name: 'Knowledge B',
        avatar: '',
        type: DatasetTypeEnum.dataset,
        vectorModel: { model: 'embedding-b', name: 'Embedding B' }
      },
      {
        _id: 'c',
        name: 'Knowledge C',
        avatar: '',
        type: DatasetTypeEnum.dataset,
        vectorModel: { model: 'embedding-a', name: 'Embedding A' }
      }
    ]
  })
}));
vi.mock('@/web/core/skill/api', () => ({
  getSkillList: vi.fn(async ({ parentId }: { parentId: string }) => ({
    list: parentId
      ? [
          {
            _id: 'nested',
            name: 'Nested skill',
            description: 'Nested description',
            type: AgentSkillTypeEnum.skill
          }
        ]
      : [
          {
            _id: 'skill-1',
            name: 'Research',
            description: 'Search and summarize documents',
            type: AgentSkillTypeEnum.skill
          },
          { _id: 'folder-1', name: 'My folder', type: AgentSkillTypeEnum.folder }
        ]
  }))
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: () => Promise<unknown>, options: { refreshDeps: unknown[] }) => {
    const [data, setData] = React.useState<unknown>();
    const latestFn = React.useRef(fn);
    latestFn.current = fn;
    const dependencyKey = JSON.stringify(options.refreshDeps);
    React.useEffect(() => {
      let active = true;
      latestFn.current().then((value) => {
        if (active) setData(value);
      });
      return () => {
        active = false;
      };
    }, [dependencyKey]);
    return { data, loading: false };
  }
}));

import DatasetSelectModal from '@/components/core/app/DatasetSelectModal';
import SkillSelectModal from '@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/SkillSelectModal';
import { getSkillList } from '@/web/core/skill/api';

let root: Root;
let container: HTMLDivElement;
const render = (child: React.ReactElement) =>
  act(async () => root.render(React.createElement(ChakraProvider, null, child)));
const button = (text: string) => {
  const item = [...container.querySelectorAll('button')].find(
    (el) => el.textContent === text || el.getAttribute('aria-label') === text
  );
  if (!item) throw new Error(`Missing button: ${text}`);
  return item;
};
const checkbox = (name: string) => {
  const item = container.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  if (!item) throw new Error(`Missing checkbox: ${name}`);
  return item;
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(state, { parentId: '', searchKey: '' });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Resource selection interactions', () => {
  it('keeps knowledge selections local until confirmation and prevents mixing index models', async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    await render(
      React.createElement(DatasetSelectModal, { defaultSelectedDatasets: [], onChange, onClose })
    );
    await act(async () => checkbox('Knowledge A').click());
    expect(checkbox('Knowledge B').disabled).toBe(true);
    expect(checkbox('Knowledge C').disabled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => button('common:Confirm').click());
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ datasetId: 'a' })]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels without applying changes and removes selections without mutating the original array', async () => {
    const selected: SelectedDatasetType[] = [
      { datasetId: 'a', name: 'Knowledge A', avatar: '', vectorModel: { model: 'embedding-a' } }
    ];
    const onChange = vi.fn();
    const onClose = vi.fn();
    await render(
      React.createElement(DatasetSelectModal, {
        defaultSelectedDatasets: selected,
        onChange,
        onClose
      })
    );
    await act(async () => button('app:agent_config_dataset_remove Knowledge A').click());
    expect(checkbox('Knowledge A').checked).toBe(false);
    expect(checkbox('Knowledge B').disabled).toBe(false);
    expect(selected).toHaveLength(1);
    await act(async () => button('common:Cancel').click());
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('selects only compatible visible knowledge bases when selecting all', async () => {
    const onChange = vi.fn();
    await render(
      React.createElement(DatasetSelectModal, {
        defaultSelectedDatasets: [],
        onChange,
        onClose: vi.fn()
      })
    );
    const all = [...container.querySelectorAll('label')]
      .find((el) => el.textContent === 'common:Select_all')
      ?.querySelector('input');
    if (!all) throw new Error('Missing select all');
    await act(async () => all.click());
    expect(checkbox('Knowledge A').checked).toBe(true);
    expect(checkbox('Knowledge C').checked).toBe(true);
    expect(checkbox('Knowledge B').checked).toBe(false);
    await act(async () => button('common:Confirm').click());
    expect(onChange.mock.calls[0][0].map((item: SelectedDatasetType) => item.datasetId)).toEqual([
      'a',
      'c'
    ]);
  });

  it('adds and removes skills immediately, shows descriptions, and supports folder navigation', async () => {
    const onClose = vi.fn();
    const SkillHarness = () => {
      const [selected, setSelected] = useState<SelectedAgentSkillItemType[]>([]);
      return React.createElement(SkillSelectModal, {
        selectedSkills: selected,
        onAddSkill: (item) => setSelected((prev) => [...prev, item]),
        onRemoveSkill: (id) => setSelected((prev) => prev.filter((item) => item.skillId !== id)),
        onClose
      });
    };
    await render(React.createElement(SkillHarness));
    expect(container.textContent).toContain('Search and summarize documents');
    await act(async () => button('common:Add').click());
    expect(container.textContent).toContain('app:resource_selected');
    expect(container.textContent).toContain('common:selected_count 1');
    await act(async () => button('common:Remove').click());
    expect(container.textContent).toContain('common:selected_count 0');
    await act(async () => button('common:Open').click());
    expect(getSkillList).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentId: 'folder-1' })
    );
    expect(container.textContent).toContain('Nested skill');
    await act(async () => button('Root').click());
    expect(container.textContent).toContain('Research');
    await act(async () => button('common:Done').click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables adding skills at the limit while keeping removal available', async () => {
    const selectedSkills = Array.from({ length: 100 }, (_, i) => ({
      skillId: i === 0 ? 'skill-1' : `selected-${i}`,
      name: `Skill ${i}`
    }));
    await render(
      React.createElement(SkillSelectModal, {
        selectedSkills,
        onAddSkill: vi.fn(),
        onRemoveSkill: vi.fn(),
        onClose: vi.fn()
      })
    );
    expect(button('common:Remove').disabled).toBe(false);
    await act(async () => button('common:Open').click());
    expect(button('common:Add').disabled).toBe(true);
  });
});
