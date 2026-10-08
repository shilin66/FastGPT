import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initData: vi.fn(async () => undefined),
  loadModels: vi.fn(async () => new Set<string>()),
  toast: vi.fn(),
  copyData: vi.fn(async () => undefined),
  fileDownload: vi.fn(),
  getWorkflowData: vi.fn(),
  filterNodes: vi.fn((nodes) => nodes),
  filterForm: vi.fn((form) => form),
  onOpenInfoEdit: vi.fn(),
  onDelApp: vi.fn(),
  appDetail: {
    name: 'Workflow',
    chatConfig: {},
    permission: { hasWritePer: true, hasManagePer: true, isOwner: true }
  }
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
      React.createElement('textarea', {
        value,
        'aria-label': 'JSON',
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)
      })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyModal', async () => {
  const { Modal, ModalContent } = await import('@chakra-ui/react');
  return {
    default: ({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) =>
      React.createElement(
        Modal,
        { isOpen: true, onClose: onClose ?? (() => {}) },
        React.createElement(ModalContent, null, children)
      )
  };
});
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: mocks.loadModels })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ getMyModelList: mocks.loadModels })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    WorkflowUtilsContext: createContext({
      initData: mocks.initData,
      flowData2StoreData: mocks.getWorkflowData
    })
  };
});
vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    AppContext: createContext({
      appDetail: mocks.appDetail,
      onOpenInfoEdit: mocks.onOpenInfoEdit,
      onDelApp: mocks.onDelApp
    })
  };
});
vi.mock('@fastgpt/web/hooks/useCopyData', () => ({
  useCopyData: () => ({ copyData: mocks.copyData })
}));
vi.mock('@/web/common/file/utils', () => ({ fileDownload: mocks.fileDownload }));
vi.mock('@/web/core/workflow/utils', () => ({ filterSensitiveNodesData: mocks.filterNodes }));
vi.mock('@/web/core/app/utils', () => ({ filterSensitiveFormData: mocks.filterForm }));

import ImportSettings from '@/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings';
import ExportConfigPopover from '@/pageComponents/app/detail/ExportConfigPopover';
import WorkflowAppMenu from '@/pageComponents/app/detail/Workflow/components/WorkflowAppMenu';
import WorkflowConfigActions from '@/pageComponents/app/detail/Workflow/components/WorkflowConfigActions';

let root: Root;
let container: HTMLDivElement;
const close = vi.fn();
const button = (text: string) => {
  const result = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(text)
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
};
const render = async (component: React.ReactNode) =>
  act(async () => root.render(React.createElement(ChakraProvider, null, component)));
const click = async (element: HTMLElement) => act(async () => element.click());
const enterJSON = async (value: string) =>
  act(async () => {
    const editor = document.querySelector('textarea');
    if (!editor) throw new Error('Missing JSON editor');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      editor,
      value
    );
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLElement.prototype.scrollTo = vi.fn();
  mocks.loadModels.mockReset().mockResolvedValue(new Set());
  mocks.initData.mockResolvedValue(undefined);
  mocks.getWorkflowData.mockReturnValue({ nodes: [], edges: [] });
  Object.assign(mocks.appDetail.permission, {
    hasWritePer: true,
    hasManagePer: true,
    isOwner: true
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Workflow configuration import', () => {
  it('disables an empty import and cancelling does not replace the workflow', async () => {
    await render(React.createElement(ImportSettings, { onClose: close }));
    expect(button('common:Import').disabled).toBe(true);
    await enterJSON('   ');
    expect(button('common:Import').disabled).toBe(true);
    await click(button('common:Cancel'));
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.initData).not.toHaveBeenCalled();
  });

  it.each(['{', '{}', '{"nodes":null,"edges":[]}', '{"nodes":[],"edges":"bad"}'])(
    'keeps the dialog open and the workflow intact for invalid configuration %s',
    async (json) => {
      await render(React.createElement(ImportSettings, { onClose: close }));
      await enterJSON(json);
      await click(button('common:Import'));
      expect(mocks.initData).not.toHaveBeenCalled();
      expect(mocks.loadModels).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'app:import_configs_failed',
        status: 'error'
      });
    }
  );

  it('waits for model permissions, prevents duplicate submission and imports after filtering', async () => {
    let resolveModels!: (models: Set<string>) => void;
    mocks.loadModels.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveModels = resolve;
      })
    );
    await render(React.createElement(ImportSettings, { onClose: close }));
    await enterJSON(
      JSON.stringify({
        nodes: [
          {
            nodeId: 'ai',
            name: 'AI',
            flowNodeType: 'chatNode',
            inputs: [
              {
                key: 'model',
                label: 'Model',
                renderTypeList: [],
                value: 'not-allowed',
                selectedTypeIndex: 0
              }
            ],
            outputs: []
          }
        ],
        edges: []
      })
    );
    await click(button('common:Import'));
    expect(mocks.initData).not.toHaveBeenCalled();
    expect(button('common:Import').disabled).toBe(true);
    expect(button('common:Cancel').disabled).toBe(true);
    await click(button('common:Import'));
    expect(mocks.loadModels).toHaveBeenCalledOnce();
    await act(async () => resolveModels(new Set(['allowed'])));
    expect(mocks.initData).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({ inputs: [expect.objectContaining({ value: undefined })] })
        ]
      })
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('allows retry after model loading fails without replacing the workflow', async () => {
    mocks.loadModels.mockRejectedValueOnce(new Error('unavailable'));
    await render(React.createElement(ImportSettings, { onClose: close }));
    await enterJSON('{"nodes":[],"edges":[]}');
    await click(button('common:Import'));
    expect(mocks.initData).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(button('common:Import').disabled).toBe(false);
    await click(button('common:Import'));
    expect(mocks.initData).toHaveBeenCalledWith({ nodes: [], edges: [] });
  });
});

describe('Workflow configuration export', () => {
  const openExport = async () => {
    await render(
      React.createElement(ExportConfigPopover, {
        variant: 'toolbar',
        appName: 'Workflow',
        getWorkflowData: mocks.getWorkflowData,
        chatConfig: { welcomeText: 'Welcome' }
      })
    );
    await click(button('app:export_configs'));
  };

  it('copies the latest draft with sensitive filtering enabled by default', async () => {
    await openExport();
    mocks.getWorkflowData.mockReturnValue({ nodes: [{ nodeId: 'latest' }], edges: [] });
    await click(button('common:copy_to_clipboard'));
    expect(mocks.filterNodes).toHaveBeenCalledWith([{ nodeId: 'latest' }]);
    expect(JSON.parse(mocks.copyData.mock.calls[0][0])).toEqual({
      nodes: [{ nodeId: 'latest' }],
      edges: [],
      chatConfig: { welcomeText: 'Welcome' }
    });
    expect(document.body.textContent).not.toContain('common:copy_to_clipboard');
  });

  it('downloads JSON without filtering when the user unchecks the option', async () => {
    await openExport();
    const checkbox = document.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    if (!checkbox) throw new Error('Missing sensitive filtering checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    await click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    await click(button('common:export_to_json'));
    expect(mocks.filterNodes).not.toHaveBeenCalled();
    expect(mocks.fileDownload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Workflow.json' })
    );
    expect(document.body.textContent).not.toContain('common:export_to_json');
  });
});

describe('Workflow application management menu', () => {
  it('restores edit, permissions and delete without team tags', async () => {
    await render(React.createElement(WorkflowAppMenu));
    await click(document.querySelector<HTMLButtonElement>('button[aria-label="common:More"]')!);
    expect(document.body.textContent).toContain('app:edit_info');
    expect(document.body.textContent).toContain('app:Role_setting');
    expect(document.body.textContent).toContain('common:Delete');
    expect(document.body.textContent).not.toContain('app:Team_Tags');
    await click(button('common:Delete'));
    expect(mocks.onDelApp).toHaveBeenCalledOnce();
  });

  it.each(['app:edit_info', 'app:Role_setting'])(
    'opens existing application settings from %s',
    async (entry) => {
      await render(React.createElement(WorkflowAppMenu));
      await click(document.querySelector<HTMLButtonElement>('button[aria-label="common:More"]')!);
      await click(button(entry));
      expect(mocks.onOpenInfoEdit).toHaveBeenCalledOnce();
    }
  );

  it('only exposes editing for a writer who cannot manage permissions or delete', async () => {
    Object.assign(mocks.appDetail.permission, { hasManagePer: false, isOwner: false });
    await render(React.createElement(WorkflowAppMenu));
    await click(document.querySelector<HTMLButtonElement>('button[aria-label="common:More"]')!);
    expect(document.body.textContent).toContain('app:edit_info');
    expect(document.body.textContent).not.toContain('app:Role_setting');
    expect(document.body.textContent).not.toContain('common:Delete');
  });

  it('keeps export available to a reader without import or management actions', async () => {
    Object.assign(mocks.appDetail.permission, {
      hasWritePer: false,
      hasManagePer: false,
      isOwner: false
    });
    await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(WorkflowAppMenu),
        React.createElement(WorkflowConfigActions)
      )
    );
    expect(document.querySelector('button[aria-label="common:More"]')).toBeNull();
    expect(document.body.textContent).not.toContain('app:import_configs');
    expect(button('app:export_configs')).toBeDefined();
  });
});
