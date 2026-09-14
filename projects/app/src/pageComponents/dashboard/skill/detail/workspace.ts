import type { SkillEditWorkspace } from '@fastgpt/global/core/agentSkills/workspace';
import { getSandboxProxyResourceId } from '@fastgpt/global/core/ai/sandbox/proxy';

export const getSkillEditorEntryUrl = ({
  workspace,
  targetPort
}: {
  workspace?: SkillEditWorkspace;
  targetPort: number;
}): string | null => {
  if (workspace?.status !== 'running' || !workspace.sandboxId) return null;
  const params = new URLSearchParams({
    sandboxId: getSandboxProxyResourceId({
      sandboxId: workspace.sandboxId,
      generation: workspace.generation
    }),
    port: String(targetPort),
    expectedWorkspaceGeneration: workspace.generation ?? 'legacy'
  });
  return `/api/core/sandbox/proxyAuth?${params.toString()}`;
};

export const hasSkillEditorWorkspaceChanged = (
  workspace: SkillEditWorkspace | undefined,
  entryUrl: string | null
): boolean => {
  if (!entryUrl) return false;
  if (!workspace?.sandboxId) return true;
  const params = new URLSearchParams(entryUrl.split('?')[1]);
  return (
    params.get('expectedWorkspaceGeneration') !== (workspace.generation ?? 'legacy') ||
    params.get('sandboxId') !==
      getSandboxProxyResourceId({
        sandboxId: workspace.sandboxId,
        generation: workspace.generation
      })
  );
};
