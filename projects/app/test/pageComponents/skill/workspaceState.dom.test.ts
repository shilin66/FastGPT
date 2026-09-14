import { describe, expect, it } from 'vitest';
import type { SkillEditWorkspace } from '@fastgpt/global/core/agentSkills/workspace';
import {
  getSkillEditorEntryUrl,
  hasSkillEditorWorkspaceChanged
} from '@/pageComponents/dashboard/skill/detail/workspace';

const workspace: SkillEditWorkspace = {
  status: 'running',
  sandboxId: 'sandbox-12345678',
  baseVersionId: 'v1',
  currentVersionId: 'v1',
  stale: false,
  resetAvailable: true
};

describe('Skill workspace editor identity', () => {
  it('binds a legacy workspace without exposing provider endpoints', () => {
    const entry = getSkillEditorEntryUrl({ workspace, targetPort: 8090 });
    expect(entry).toBe(
      '/api/core/sandbox/proxyAuth?sandboxId=sandbox-12345678&port=8090&expectedWorkspaceGeneration=legacy'
    );
    expect(hasSkillEditorWorkspaceChanged(workspace, entry)).toBe(false);
  });
  it('does not reload an editor when only the published version changes', () => {
    const entry = getSkillEditorEntryUrl({ workspace, targetPort: 8090 });
    expect(
      hasSkillEditorWorkspaceChanged({ ...workspace, currentVersionId: 'v2', stale: true }, entry)
    ).toBe(false);
  });
  it('requires a new origin after reset, including for the same logical sandbox', () => {
    const oldEntry = getSkillEditorEntryUrl({ workspace, targetPort: 8090 });
    const reset = { ...workspace, generation: '22222222-2222-4222-8222-222222222222' };
    expect(hasSkillEditorWorkspaceChanged(reset, oldEntry)).toBe(true);
    const nextEntry = getSkillEditorEntryUrl({ workspace: reset, targetPort: 8090 });
    expect(nextEntry).toContain('sandboxId=ws-22222222-2222-4222-8222-222222222222');
    expect(hasSkillEditorWorkspaceChanged(reset, nextEntry)).toBe(false);
  });
  it.each(['absent', 'conflict', 'failed', 'provisioning'] as const)(
    'does not open a %s workspace',
    (status) => {
      expect(
        getSkillEditorEntryUrl({ workspace: { ...workspace, status }, targetPort: 8090 })
      ).toBeNull();
    }
  );
  it('invalidates an editor if authorization no longer exposes its workspace', () => {
    expect(
      hasSkillEditorWorkspaceChanged(
        undefined,
        getSkillEditorEntryUrl({ workspace, targetPort: 8090 })
      )
    ).toBe(true);
  });
});
