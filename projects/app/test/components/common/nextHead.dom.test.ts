import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Head from 'next/head';
import initHeadManager from 'next/dist/client/head-manager';
import { HeadManagerContext } from 'next/dist/shared/lib/head-manager-context.shared-runtime';
import { describe, expect, it } from 'vitest';
import NextHead from '@/components/common/NextHead';

describe('page metadata', () => {
  it('keeps the system favicon while page titles change', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const headManager = initHeadManager();

    const renderPage = async (title: string) => {
      await act(async () => {
        root.render(
          React.createElement(
            HeadManagerContext.Provider,
            { value: headManager },
            React.createElement(
              React.Fragment,
              null,
              React.createElement(
                Head,
                null,
                React.createElement('link', {
                  rel: 'icon',
                  href: '/system-favicon.svg',
                  key: 'favicon'
                })
              ),
              React.createElement(NextHead, { title, icon: '/resource-avatar.png' })
            )
          )
        );
      });
    };

    await renderPage('应用详情');
    expect(document.title).toBe('应用详情');
    expect(
      Array.from(document.head.querySelectorAll('link[rel="icon"][data-next-head]')).map((link) =>
        link.getAttribute('href')
      )
    ).toEqual(['/system-favicon.svg']);

    await renderPage('数据集详情');
    expect(document.title).toBe('数据集详情');
    expect(
      Array.from(document.head.querySelectorAll('link[rel="icon"][data-next-head]')).map((link) =>
        link.getAttribute('href')
      )
    ).toEqual(['/system-favicon.svg']);

    await act(async () => root.unmount());
    container.remove();
  });
});
