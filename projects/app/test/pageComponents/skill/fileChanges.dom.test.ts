import { describe, expect, it } from 'vitest';
import {
  diffWorkspaceFiles,
  mergeWorkspaceFileChanges,
  type WorkspaceFileChange
} from '@/pageComponents/dashboard/skill/detail/config/fileChanges';

describe('workspace file observations', () => {
  it('keeps the newest observation per path before limiting the recent files', () => {
    const previous: WorkspaceFileChange[] = Array.from({ length: 8 }, (_, index) => ({
      path: `${index}.md`,
      type: 'created',
      version: '1'
    }));
    const latest: WorkspaceFileChange[] = [
      { path: '7.md', type: 'modified', version: '2' },
      { path: '0.md', type: 'deleted', version: '1' },
      { path: 'new.md', type: 'created', version: '1' }
    ];
    const result = mergeWorkspaceFileChanges(previous, latest);
    expect(result).toHaveLength(8);
    expect(result.slice(0, 3)).toEqual(latest);
    expect(new Set(result.map((change) => change.path)).size).toBe(8);
    expect(result.some((change) => change.path === '6.md')).toBe(false);
    expect(
      mergeWorkspaceFileChanges(result, [{ path: '0.md', type: 'created', version: '3' }])[0]
    ).toEqual({ path: '0.md', type: 'created', version: '3' });
  });
  it('carries real paths and version stamps for creates, changes and deletes', () => {
    const entry = (path: string, version: string) => ({
      path,
      version,
      type: 'file' as const,
      size: 1
    });
    expect(
      diffWorkspaceFiles(
        [entry('old.txt', '1'), entry('change.txt', '1'), entry('same.txt', '1')],
        [entry('new.txt', '2'), entry('change.txt', '2'), entry('same.txt', '1')]
      )
    ).toEqual([
      { path: 'new.txt', type: 'created', version: '2' },
      { path: 'change.txt', type: 'modified', version: '2' },
      { path: 'old.txt', type: 'deleted', version: '1' }
    ]);
  });
});
