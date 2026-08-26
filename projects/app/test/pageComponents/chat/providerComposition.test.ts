import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('portal app list request ownership', () => {
  it('mounts one shared app list provider for the whole portal', () => {
    const page = readSource('pages/chat/index.tsx');
    const sidebar = readSource('pageComponents/chat/slider/index.tsx');
    const teamApps = readSource('pageComponents/chat/ChatTeamApp/index.tsx');

    expect(page.match(/<AppListContextProvider>/g)).toHaveLength(1);
    expect(sidebar).not.toContain('<AppListContextProvider>');
    expect(teamApps).not.toContain('<AppListContextProvider>');
  });

  it('waits for the team identity before requesting recent apps', () => {
    const context = readSource('web/core/chat/context/chatPageContext.tsx');

    expect(context).toContain('teamMemberId ? getRecentlyUsedApps() : Promise.resolve([])');
  });
});
