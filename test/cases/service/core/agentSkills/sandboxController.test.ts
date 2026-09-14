import { describe, expect, it } from 'vitest';
import { shouldRestoreEditWorkspace } from '@fastgpt/service/core/agentSkills/sandboxController';

describe('shouldRestoreEditWorkspace', () => {
  it('preserves files on the persistent volume when the provider rebuilt the container', () => {
    expect(
      shouldRestoreEditWorkspace({
        previousProviderSandboxId: 'old-provider-id',
        currentProviderSandboxId: 'new-provider-id',
        workspaceIsEmpty: false
      })
    ).toBe(false);
  });

  it('restores a rebuilt container only when its workspace is confirmed empty', () => {
    expect(
      shouldRestoreEditWorkspace({
        previousProviderSandboxId: 'old-provider-id',
        currentProviderSandboxId: 'new-provider-id',
        workspaceIsEmpty: true
      })
    ).toBe(true);
  });

  it('preserves unpublished files while the provider container is unchanged', () => {
    expect(
      shouldRestoreEditWorkspace({
        previousProviderSandboxId: 'provider-id',
        currentProviderSandboxId: 'provider-id',
        workspaceIsEmpty: true
      })
    ).toBe(false);
  });

  it('restores a legacy instance only when no user entries remain', () => {
    expect(
      shouldRestoreEditWorkspace({
        currentProviderSandboxId: 'provider-id',
        workspaceIsEmpty: true
      })
    ).toBe(true);
    expect(
      shouldRestoreEditWorkspace({
        currentProviderSandboxId: 'provider-id',
        workspaceIsEmpty: false
      })
    ).toBe(false);
  });
});
