import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sandboxEndpointUrl: '/api/core/sandbox/proxyAuth?sandboxId=logical-sandbox&port=8090'
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: typeof state) => unknown) =>
    selector(state)
}));
vi.mock('@/pageComponents/dashboard/skill/detail/context', () => ({
  SkillDetailContext: {}
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Flex: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
  Button: ({ children }: { children: React.ReactNode }) =>
    React.createElement('button', null, children)
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import SandboxIframe from '@/pageComponents/dashboard/skill/detail/config/SandboxIframe';

describe('Skill editor proxy entry', () => {
  it('loads the authenticated entry URL without appending an upstream proxy path', () => {
    const markup = renderToStaticMarkup(React.createElement(SandboxIframe));
    expect(markup).toContain(
      'src="/api/core/sandbox/proxyAuth?sandboxId=logical-sandbox&amp;port=8090"'
    );
    expect(markup).not.toContain('proxy/8080/');
  });

  it('labels the editor and does not send its entry URL as referrer', () => {
    const markup = renderToStaticMarkup(React.createElement(SandboxIframe));
    expect(markup).toContain('title="Skill workspace editor"');
    expect(markup).toContain('referrerPolicy="no-referrer"');
  });
});
