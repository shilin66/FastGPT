import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const resourceListSources = [
  {
    label: 'application and integration',
    path: 'pageComponents/dashboard/agent/List.tsx'
  },
  {
    label: 'knowledge base',
    path: 'pageComponents/dataset/list/List.tsx'
  }
] as const;

const readMenuAnchorSource = (path: string) => {
  const source = readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
  const anchorStart = source.indexOf('className="more"');
  const menuStart = source.indexOf('<MyMenu', anchorStart);

  expect(anchorStart).toBeGreaterThan(-1);
  expect(menuStart).toBeGreaterThan(anchorStart);

  return source.slice(anchorStart, menuStart);
};

describe('resource list card action menus', () => {
  it.each(resourceListSources)(
    'keeps the $label menu anchor in layout while the portalled menu is open',
    ({ path }) => {
      // Given: the card action menu is hidden until the desktop card is hovered.
      const menuAnchorSource = readMenuAnchorSource(path);

      // When: the pointer leaves the card to interact with the portalled menu.
      // Then: the anchor remains measurable instead of collapsing to a zero rectangle.
      expect(menuAnchorSource).not.toContain("display={['', 'none']}");
      expect(menuAnchorSource).toContain("display={'block'}");
      expect(menuAnchorSource).toContain('opacity={[1, 0]}');
      expect(menuAnchorSource).toContain("pointerEvents={['auto', 'none']}");
      expect(menuAnchorSource).toContain('_focusWithin={{');
    }
  );
});
