import { POST } from '@/web/common/api/request';
import type {
  SandboxWorkspaceActionBody,
  SandboxWorkspacesListBody,
  SandboxWorkspacesListResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/management';

export const listSandboxWorkspaces = (body: SandboxWorkspacesListBody) =>
  POST<SandboxWorkspacesListResponse>('/core/ai/sandbox/workspaces/list', body);

export const actOnSandboxWorkspace = (body: SandboxWorkspaceActionBody) =>
  POST<{ success: boolean }>('/core/ai/sandbox/workspaces/action', body);
