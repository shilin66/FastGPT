import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import { theme } from '@fastgpt/web/styles/theme';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
const onSuccess = vi.fn();
const click = async (element: HTMLElement | null) => {
  if (!element) throw new Error('Missing calendar control');
  await act(async () => element.click());
};
const select = async (kind: 'year' | 'month', value: string) => {
  await click(
    container.querySelector(`button[aria-label="选择${kind === 'year' ? '年份' : '月份'}"]`)
  );
  const label = kind === 'year' ? `${value} 年` : `${Number(value) + 1} 月`;
  const option = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (element) => element.textContent === label
  );
  await click(option ?? null);
};
const open = async () => {
  await act(async () => {
    root.render(
      React.createElement(
        ChakraProvider,
        { theme },
        React.createElement(DateRangePicker, {
          defaultDate: { from: new Date(2026, 9, 2), to: new Date(2026, 9, 8) },
          onSuccess
        })
      )
    );
  });
  await click(
    [...container.querySelectorAll('div')]
      .filter((el) => el.textContent === '2026/10/02 - 2026/10/08')
      .at(-1) ?? null
  );
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 8, 12));
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DateRangePicker year and month navigation', () => {
  it('starts year navigation at 2025 without applying a range', async () => {
    await open();
    const yearButton = container.querySelector<HTMLButtonElement>('button[aria-label="选择年份"]');
    await click(yearButton);
    const yearMenuId = yearButton?.getAttribute('aria-controls');
    const yearMenu = yearMenuId ? document.getElementById(yearMenuId) : null;
    expect(
      [...(yearMenu?.querySelectorAll('[role="menuitem"]') ?? [])].map(
        (element) => element.textContent
      )
    ).toEqual(['2025 年', '2026 年']);
    await click(container.querySelector('button[aria-label="选择年份"]'));
    await select('year', '2025');
    await select('month', '5');
    expect(container.querySelector('[data-day="2025-06-15"]')).not.toBeNull();
    await select('month', '0');
    const previousMonth = container.querySelector<HTMLButtonElement>(
      'button[aria-label="前往上个月"]'
    );
    expect(previousMonth?.getAttribute('aria-disabled')).toBe('true');
    await click(previousMonth);
    expect(container.querySelector('[data-day="2025-01-15"]')).not.toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('confirms a date range after switching months and preserves whole-day boundaries', async () => {
    await open();
    await select('month', '7');
    await click(container.querySelector('[data-day="2026-08-20"] button'));
    await click(container.querySelector('[data-day="2026-08-22"] button'));
    const confirm = [...container.querySelectorAll('button')].find(
      (el) => el.textContent === 'common:Confirm'
    );
    await click(confirm ?? null);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith({
      from: new Date(2026, 7, 20, 0, 0, 0, 0),
      to: new Date(2026, 7, 22, 23, 59, 59, 999)
    });
  });
});
