import type { SkillWorkspaceFileResponse } from '@fastgpt/global/openapi/core/agentSkills/files';

type Entry = Extract<SkillWorkspaceFileResponse, { action: 'list' }>['files'][number];
export type WorkspaceFileChange = {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  version: string;
};

export const mergeWorkspaceFileChanges = (
  previous: WorkspaceFileChange[],
  latest: WorkspaceFileChange[]
): WorkspaceFileChange[] => {
  const seen = new Set<string>();
  return [...latest, ...previous]
    .filter((change) => {
      if (seen.has(change.path)) return false;
      seen.add(change.path);
      return true;
    })
    .slice(0, 8);
};

export const diffWorkspaceFiles = (previous: Entry[], next: Entry[]): WorkspaceFileChange[] => {
  const before = new Map(
    previous.filter((entry) => entry.type === 'file').map((entry) => [entry.path, entry])
  );
  const after = new Map(
    next.filter((entry) => entry.type === 'file').map((entry) => [entry.path, entry])
  );
  return [
    ...[...after.values()].flatMap((entry): WorkspaceFileChange[] => {
      const old = before.get(entry.path);
      return old?.version === entry.version
        ? []
        : [{ path: entry.path, type: old ? 'modified' : 'created', version: entry.version }];
    }),
    ...[...before.values()]
      .filter((entry) => !after.has(entry.path))
      .map(
        (entry): WorkspaceFileChange => ({
          path: entry.path,
          type: 'deleted',
          version: entry.version
        })
      )
  ];
};
