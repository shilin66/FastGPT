import { describe, expect, it } from 'vitest';
import { diffWorkspaceFiles } from '@/pageComponents/dashboard/skill/detail/config/fileChanges';

describe('workspace file observations', () => {
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
