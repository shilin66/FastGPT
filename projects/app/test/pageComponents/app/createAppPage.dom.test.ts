import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import CreateAppsPage from '@/pages/dashboard/create';

const mocks = vi.hoisted(() => ({
  query: { parentId: 'folder-one', appType: 'chatAgent' },
  push: vi.fn(),
  replace: vi.fn(),
  create: vi.fn(),
  http: vi.fn(),
  mcp: vi.fn(),
  parse: vi.fn(),
  templates: vi.fn()
}));
vi.mock('next/router', () => ({ useRouter: () => ({ ...mocks, query: mocks.query }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/i18n/utils', () => ({ i18nT: (key: string) => key }));
vi.mock('@/web/common/i18n/utils', () => ({ serviceSideProps: vi.fn() }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Image/MyImage', () => ({ default: () => null }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useRequest', async () => {
  const { useRequest } = await import('ahooks');
  return {
    useRequest: (
      service: Parameters<typeof useRequest>[0],
      options: Parameters<typeof useRequest>[1]
    ) => useRequest(service, { manual: true, ...options })
  };
});
vi.mock('@fastgpt/web/common/file/hooks/useUploadAvatar', () => ({
  useUploadAvatar: () => ({ Component: () => null, handleFileSelectorOpen: vi.fn() })
}));
vi.mock('@/web/common/file/api', () => ({ getUploadAvatarPresignedUrl: vi.fn() }));
vi.mock('@/web/core/app/api', () => ({ postCreateApp: mocks.create }));
vi.mock('@/web/core/app/api/httpTools', () => ({ postCreateHttpTools: mocks.http }));
vi.mock('@/web/core/app/api/mcpTools', () => ({
  getMCPTools: mocks.parse,
  postCreateMCPTools: mocks.mcp
}));
vi.mock('@/web/core/app/api/template', () => ({
  getTemplateMarketItemList: mocks.templates,
  getTemplateMarketItemDetail: vi.fn()
}));
vi.mock('@/web/core/app/templates', () => ({
  getEmptyAppsTemplate: () =>
    Object.fromEntries(
      Object.values(AppTypeEnum).map((type) => [type, { nodes: [], edges: [], chatConfig: {} }])
    )
}));
vi.mock('@/components/common/secret/HeaderAuthForm', () => ({ default: () => null }));
vi.mock('@/components/common/secret/HeaderAuthConfig', () => ({
  headerValue2StoreHeader: () => ({})
}));

describe('Agent and tool creation page', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async (appType = AppTypeEnum.chatAgent) => {
    mocks.query.appType = appType;
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(CreateAppsPage)))
    );
  };
  const button = (text: string) => {
    const el = [...container.querySelectorAll('button')].find((el) => el.textContent === text);
    if (!el) throw new Error(`Missing button ${text}`);
    return el;
  };
  const submit = () =>
    act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  const fill = (id: string, value: string) =>
    act(async () => {
      const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue('new-agent');
    mocks.http.mockResolvedValue('new-http');
    mocks.mcp.mockResolvedValue('new-mcp');
    mocks.parse.mockResolvedValue([{ name: 'lookup', description: 'Find an item' }]);
    mocks.templates.mockResolvedValue({ list: [] });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('React', React);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  it('shows three accessible Agent choices and guidance without requesting templates', async () => {
    await render();
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(3);
    expect(container.querySelector('aside')).not.toBeNull();
    expect(mocks.templates).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('app:create_by_template');
    await submit();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: AppTypeEnum.chatAgent, parentId: 'folder-one' })
    );
    expect(mocks.push).toHaveBeenCalledWith('/app/detail?appId=new-agent');
  });
  it('preserves the folder when cancelling tool creation', async () => {
    await render(AppTypeEnum.httpToolSet);
    await act(async () => button('common:Cancel').click());
    expect(mocks.replace).toHaveBeenCalledWith({
      pathname: '/dashboard/tool',
      query: { parentId: 'folder-one' }
    });
  });
  it('keeps HTTP creation and its configuration ahead of the common submit action', async () => {
    await render(AppTypeEnum.httpToolSet);
    expect(container.querySelector('form')?.textContent).toContain('app:HTTPTools_Create_Type');
    await submit();
    expect(mocks.http).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'folder-one', createType: 'batch' })
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('supports the manual HTTP option through a native radio input', async () => {
    await render(AppTypeEnum.httpToolSet);
    const radio = container.querySelector<HTMLInputElement>('input[type="radio"][value="manual"]');
    expect(radio).not.toBeNull();
    await act(async () => radio!.click());
    await submit();
    expect(mocks.http).toHaveBeenCalledWith(expect.objectContaining({ createType: 'manual' }));
  });
  it('does not allow MCP creation before parsing tools', async () => {
    await render(AppTypeEnum.mcpToolSet);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true
    );
    expect(container.querySelector('label[for="create-mcp-url"]')).not.toBeNull();
    await submit();
    expect(mocks.mcp).not.toHaveBeenCalled();
  });
  it('creates with the parsed MCP tools and invalidates them when the URL changes', async () => {
    await render(AppTypeEnum.mcpToolSet);
    await fill('create-mcp-url', 'https://example.com/mcp');
    await act(async () => button('common:Parse').click());
    expect(mocks.parse).toHaveBeenCalledWith({ url: 'https://example.com/mcp', headerSecret: {} });
    expect(container.querySelector('tbody')?.textContent).toContain('lookup');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      false
    );
    await submit();
    expect(mocks.mcp).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/mcp',
        toolList: [{ name: 'lookup', description: 'Find an item' }]
      })
    );
    await fill('create-mcp-url', 'https://example.com/other');
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true
    );
    expect(container.querySelector('tbody')?.textContent).not.toContain('lookup');
  });
  it('switches from MCP to workflow tools without requiring an MCP URL', async () => {
    await render(AppTypeEnum.mcpToolSet);
    const choice = [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
      (el) => el.textContent?.includes('app:toolType_workflow')
    )!;
    await act(async () => choice.click());
    await fill('create-app-name', 'Workflow tool');
    await submit();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: AppTypeEnum.workflowTool, name: 'Workflow tool' })
    );
  });
  it('keeps the draft after a failed request and allows retrying', async () => {
    await render();
    mocks.create.mockRejectedValueOnce(new Error('Creation failed'));
    await fill('create-app-name', 'Draft Agent');
    await submit();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('#create-app-name')?.value).toBe(
      'Draft Agent'
    );
    await submit();
    expect(mocks.push).toHaveBeenCalledWith('/app/detail?appId=new-agent');
  });
});
