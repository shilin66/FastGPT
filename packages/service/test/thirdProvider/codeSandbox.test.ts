import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosSpies = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  use: vi.fn()
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: axiosSpies.get,
      post: axiosSpies.post,
      interceptors: {
        response: {
          use: axiosSpies.use
        }
      }
    }))
  }
}));

import { CodeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';

describe('CodeSandbox 请求关联', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosSpies.post.mockResolvedValue({
      data: {
        codeReturn: { ok: true },
        log: ''
      }
    });
  });

  it('将 workflow requestId 传入 code-sandbox 请求头', async () => {
    const sandbox = new CodeSandbox();
    const request = {
      codeType: 'js',
      code: 'function main() { return { ok: true }; }',
      variables: {},
      requestId: 'workflow-request-1'
    };

    await sandbox.runCode(request);

    expect(axiosSpies.post).toHaveBeenCalledWith(
      '/js',
      {
        code: request.code,
        variables: request.variables
      },
      {
        headers: {
          'x-fastgpt-request-id': request.requestId
        }
      }
    );
  });
});
