import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/agentSkills/import';
import { multer } from '@fastgpt/service/common/file/multer';

function makeResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn()
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('POST /api/core/agentSkills/import', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('authenticates before consuming multipart data', async () => {
    const resolveFormData = vi.spyOn(multer, 'resolveFormData');
    const request = { method: 'POST', headers: {}, body: {} };

    await handler(request, makeResponse());

    expect(resolveFormData).not.toHaveBeenCalled();
  });
});
