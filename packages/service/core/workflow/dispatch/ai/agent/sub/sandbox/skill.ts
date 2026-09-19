/**
 * Agent Sandbox Tool Dispatch
 *
 * Implements the 5 sandbox tool dispatch functions that map
 * LLM tool calls to ISandbox operations.
 */

import type { AgentSandboxContext } from './types';
import type { z } from 'zod';
import type {
  SandboxReadFileSchema,
  SandboxWriteFileSchema,
  SandboxEditFileSchema,
  SandboxExecuteSchema,
  SandboxSearchSchema,
  SandboxFetchUserFileSchema
} from '@fastgpt/global/core/workflow/node/agent/skillTools';
import axios from 'axios';
import {
  executeWorkspaceCommand,
  WorkspaceCommandOutcomeUnknown
} from '../../../../../../ai/sandbox/command';
import { readSandboxTextRange } from '../../../../../../ai/sandbox/text';
import { SandboxUnavailableError } from './errors';
import { isSandboxInfrastructureError } from '../../../../../../ai/sandbox/errors';
import { serverRequestBaseUrl } from '../../../../../../../common/api/serverRequest';
import {
  assertSandboxWorkspacePath,
  resolveSandboxWorkspacePath
} from '../../../../../../ai/sandbox/workspace';

type DispatchResult = {
  response: string;
  usages: [];
};

const validateToolPath = (
  ctx: AgentSandboxContext,
  options: { path: string; allowMissing?: boolean }
) =>
  assertSandboxWorkspacePath({
    provider: ctx.sandbox,
    workspaceRoot: ctx.workDirectory,
    ...options
  });

const assertFileResult = (
  ctx: AgentSandboxContext,
  {
    file,
    expectedPath
  }: { file: { path: string; error: Error | null } | undefined; expectedPath: string }
) => {
  if (!file) throw new Error('Missing Sandbox file result');
  if (file.error) throw file.error;
  const returnedPath = resolveSandboxWorkspacePath({
    workspaceRoot: ctx.workDirectory,
    path: file.path
  });
  if (returnedPath !== expectedPath) throw new Error('Unexpected Sandbox file result');
};

/**
 * Read files from sandbox
 */
export async function dispatchSandboxReadFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxReadFileSchema>
): Promise<DispatchResult> {
  try {
    if (ctx.builtinSkillRoot || params.startLine !== undefined || params.maxLines !== undefined) {
      const results = await Promise.all(
        params.paths.map(async (path) => {
          const workspaceRoot =
            ctx.builtinSkillRoot && path === `${ctx.builtinSkillRoot}/SKILL.md`
              ? ctx.builtinSkillRoot
              : ctx.workDirectory;
          const result = await readSandboxTextRange({
            provider: ctx.sandbox,
            workspaceRoot,
            path,
            startLine: params.startLine,
            maxLines: params.maxLines
          });
          return `--- ${resolveSandboxWorkspacePath({ workspaceRoot, path })} ---\n${result.type === 'binary' ? `[Binary file: ${result.size} bytes]` : result.content}${result.truncated ? '\n[Truncated; request a later startLine or inspect the log with a bounded command.]' : ''}`;
        })
      );
      return { response: results.join('\n\n'), usages: [] };
    }
    const paths = await Promise.all(
      params.paths.map((path) =>
        ctx.builtinSkillRoot && path === `${ctx.builtinSkillRoot}/SKILL.md`
          ? assertSandboxWorkspacePath({
              provider: ctx.sandbox,
              workspaceRoot: ctx.builtinSkillRoot,
              path
            })
          : validateToolPath(ctx, { path })
      )
    );
    const files = await ctx.sandbox.readFiles(paths);

    if (paths.length === 0) {
      return { response: 'No files found', usages: [] };
    }
    if (files.length !== paths.length) throw new Error('Missing Sandbox file result');

    const results = files.map((file, index) => {
      if (ctx.builtinSkillRoot && paths[index] === `${ctx.builtinSkillRoot}/SKILL.md`) {
        if (file.error) throw file.error;
        if (file.path !== paths[index]) throw new Error('Unexpected builtin file result');
      } else assertFileResult(ctx, { file, expectedPath: paths[index] });
      const content = new TextDecoder('utf-8').decode(file.content);
      return `--- ${file.path} ---\n${content}`;
    });

    return { response: results.join('\n\n'), usages: [] };
  } catch (error) {
    if (isSandboxInfrastructureError(error)) throw new SandboxUnavailableError();
    return {
      response: `Failed to read files: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Write a file to sandbox
 */
export async function dispatchSandboxWriteFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxWriteFileSchema>
): Promise<DispatchResult> {
  try {
    const path = await validateToolPath(ctx, { path: params.path, allowMissing: true });
    const files = await ctx.sandbox.writeFiles([
      {
        path,
        data: new TextEncoder().encode(params.content)
      }
    ]);
    assertFileResult(ctx, { file: files[0], expectedPath: path });

    return { response: `File written successfully: ${params.path}`, usages: [] };
  } catch (error) {
    if (isSandboxInfrastructureError(error)) throw new SandboxUnavailableError();
    return {
      response: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Edit files in sandbox using find-and-replace
 */
export async function dispatchSandboxEditFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxEditFileSchema>
): Promise<DispatchResult> {
  try {
    const entries = await Promise.all(
      params.entries.map(async (entry) => ({
        ...entry,
        path: await validateToolPath(ctx, { path: entry.path })
      }))
    );
    const paths = [...new Set(entries.map((entry) => entry.path))];
    const files = await ctx.sandbox.readFiles(paths);
    if (files.length !== paths.length) throw new Error('Missing Sandbox file result');
    const pendingWrites = new Map<string, string>();
    files.forEach((file, index) => {
      assertFileResult(ctx, { file, expectedPath: paths[index] });
      pendingWrites.set(
        paths[index],
        new TextDecoder('utf-8', { fatal: true }).decode(file.content)
      );
    });
    for (const entry of entries) {
      const content = pendingWrites.get(entry.path);
      if (content === undefined || !entry.oldContent || !content.includes(entry.oldContent)) {
        throw new Error(`Original content not found: ${entry.path}`);
      }
      pendingWrites.set(entry.path, content.split(entry.oldContent).join(entry.newContent));
    }
    // All matches are checked before writing, but separate provider writes are not a transaction
    // and do not protect against concurrent writers changing the same files.
    for (const [path, content] of pendingWrites) {
      await validateToolPath(ctx, { path });
      const results = await ctx.sandbox.writeFiles([
        { path, data: new TextEncoder().encode(content) }
      ]);
      assertFileResult(ctx, { file: results[0], expectedPath: path });
    }

    const editedPaths = params.entries.map((e) => e.path).join(', ');
    return { response: `Files edited successfully: ${editedPaths}`, usages: [] };
  } catch (error) {
    if (isSandboxInfrastructureError(error)) throw new SandboxUnavailableError();
    return {
      response: `Failed to edit files: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Execute a shell command in sandbox
 */
export async function dispatchSandboxExecute(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxExecuteSchema>
): Promise<DispatchResult> {
  try {
    const workingDirectory = await validateToolPath(ctx, { path: params.workingDirectory ?? '.' });
    if (ctx.builtinSkillRoot) {
      const result = await executeWorkspaceCommand({
        provider: ctx.sandbox,
        workspaceRoot: ctx.workDirectory,
        ...params,
        workingDirectory,
        shouldStop: ctx.shouldStop
      });
      return { response: JSON.stringify(result), usages: [] };
    }
    const result = await ctx.sandbox.execute(params.command, {
      workingDirectory,
      timeoutMs: params.timeoutMs
    });

    const parts: string[] = [];
    parts.push(`Exit code: ${result.exitCode}`);
    if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
    if (result.stderr) parts.push(`stderr:\n${result.stderr}`);

    return { response: parts.join('\n'), usages: [] };
  } catch (error) {
    if (error instanceof WorkspaceCommandOutcomeUnknown) throw new SandboxUnavailableError();
    if (isSandboxInfrastructureError(error)) throw new SandboxUnavailableError();
    return {
      response: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Search files in sandbox
 */
export async function dispatchSandboxSearch(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxSearchSchema>
): Promise<DispatchResult> {
  try {
    if (/[\u0000-\u001f\u007f\\$`"]/.test(params.pattern)) {
      throw new Error('Search pattern contains characters unsupported by the Sandbox provider');
    }
    const searchRoot = await validateToolPath(ctx, { path: params.path ?? '.' });
    const results = await ctx.sandbox.search(params.pattern, searchRoot);

    if (!results || results.length === 0) {
      return { response: 'No matching files found', usages: [] };
    }

    const paths = await Promise.all(
      results.slice(0, 200).map(async (result) => {
        const path = await validateToolPath(ctx, { path: result.path });
        if (path !== searchRoot && !path.startsWith(`${searchRoot}/`))
          throw new Error('Search result is outside the requested directory');
        return path;
      })
    );
    return {
      response: `Matching files:\n${paths.join('\n')}${results.length > paths.length ? '\n[Truncated to 200 matches; narrow the search directory or pattern.]' : ''}`,
      usages: []
    };
  } catch (error) {
    if (isSandboxInfrastructureError(error)) throw new SandboxUnavailableError();
    return {
      response: `Failed to search files: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}

/**
 * Fetch a user-uploaded file (from conversation) and write it into the sandbox filesystem
 */

export async function dispatchSandboxFetchUserFile(
  ctx: AgentSandboxContext,
  params: z.infer<typeof SandboxFetchUserFileSchema>,
  allFilesMap: Record<string, { url: string; name: string; type: string }>
): Promise<DispatchResult> {
  const fileEntry = allFilesMap[params.file_index];
  if (!fileEntry) {
    return {
      response: `Failed: file index "${params.file_index}" not found in available_files`,
      usages: []
    };
  }

  try {
    const resolvedPath = await validateToolPath(ctx, {
      path: params.target_path,
      allowMissing: true
    });
    let buffer: ArrayBuffer;
    try {
      const response = await axios.get<ArrayBuffer>(fileEntry.url, {
        baseURL: serverRequestBaseUrl,
        responseType: 'arraybuffer'
      });
      buffer = response.data;
    } catch (error) {
      return {
        response: `Failed to fetch user file: ${error instanceof Error ? error.message : String(error)}`,
        usages: []
      };
    }

    await validateToolPath(ctx, { path: resolvedPath, allowMissing: true });
    const files = await ctx.sandbox.writeFiles([{ path: resolvedPath, data: buffer }]);
    assertFileResult(ctx, { file: files[0], expectedPath: resolvedPath });

    return {
      response: `File written to sandbox: ${resolvedPath} (name: ${fileEntry.name}, size: ${buffer.byteLength} bytes)`,
      usages: []
    };
  } catch (error) {
    if (isSandboxInfrastructureError(error)) throw new SandboxUnavailableError();
    return {
      response: `Failed to fetch user file: ${error instanceof Error ? error.message : String(error)}`,
      usages: []
    };
  }
}
