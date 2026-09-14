import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import * as esm from '@fastgpt-sdk/sandbox-adapter';
import { isSandboxInfrastructureError } from '@fastgpt/service/core/ai/sandbox/errors';
import { dispatchSandboxReadFile } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/skill';
import { SandboxUnavailableError } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/errors';

const commonJs: typeof esm = createRequire(import.meta.url)('@fastgpt-sdk/sandbox-adapter');

describe.each([
  { name: 'ESM', sdk: esm },
  { name: 'CommonJS', sdk: commonJs }
])('Provider file-read error cause ($name)', ({ sdk }) => {
  it('preserves a transport failure through the real SDK readFiles polyfill', async () => {
    const provider = sdk.createSandbox('opensandbox', {
      baseUrl: 'http://sandbox.example.test',
      sessionId: 'read-failure-test'
    });
    const transport = new sdk.ConnectionError('PRIVATE_TRANSPORT');
    const error = new sdk.CommandExecutionError('transport failed', 'stat file', transport);
    const execute = vi.spyOn(provider, 'execute').mockRejectedValue(error);
    try {
      const result = (await provider.readFiles(['/workspace/file']))[0];
      expect(isSandboxInfrastructureError(result.error)).toBe(true);
      expect(result.error?.cause).toBe(error);
      execute.mockImplementation(async (command: string) => {
        if (command.startsWith("'python3'"))
          return { exitCode: 0, stdout: 'FASTGPT_WORKSPACE_PATH_OK', stderr: '' };
        throw error;
      });
      await expect(
        dispatchSandboxReadFile(
          {
            sandbox: provider,
            sandboxId: 'sandbox',
            providerSandboxId: 'provider-sandbox',
            sessionId: 'session',
            skills: [],
            deployedSkills: [],
            workDirectory: '/workspace',
            isReady: true
          },
          { paths: ['/workspace/file'] }
        )
      ).rejects.toBeInstanceOf(SandboxUnavailableError);
    } finally {
      execute.mockRestore();
    }
  });

  it('keeps ordinary command/file errors recoverable', async () => {
    const provider = sdk.createSandbox('opensandbox', {
      baseUrl: 'http://sandbox.example.test',
      sessionId: 'read-file-error-test'
    });
    const execute = vi
      .spyOn(provider, 'execute')
      .mockRejectedValue(
        new sdk.CommandExecutionError('file missing', 'stat file', 1, '', 'No such file')
      );
    try {
      const result = (await provider.readFiles(['/workspace/missing']))[0];
      expect(result.error).toBeInstanceOf(sdk.FileOperationError);
      expect(result.error).toMatchObject({ code: 'FILE_NOT_FOUND' });
      expect(isSandboxInfrastructureError(result.error)).toBe(false);
    } finally {
      execute.mockRestore();
    }
  });
});
