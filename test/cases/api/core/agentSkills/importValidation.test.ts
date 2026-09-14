import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import { Stats } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import handler from '@/pages/api/core/agentSkills/import';
import { multer } from '@fastgpt/service/common/file/multer';
import { importSkill } from '@fastgpt/service/core/agentSkills/controller';
import * as validator from '@fastgpt/service/core/agentSkills/packageValidator';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import zhCN from '@fastgpt/web/i18n/zh-CN/skill.json';
import zhHant from '@fastgpt/web/i18n/zh-Hant/skill.json';
import en from '@fastgpt/web/i18n/en/skill.json';

vi.unmock('@fastgpt/service/common/response');
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: vi.fn(async () => ({ teamId: 'team', tmbId: 'member', userId: 'user' }))
}));
vi.mock('@fastgpt/service/support/user/team/status', () => ({
  assertTeamWritable: vi.fn()
}));
vi.mock('@fastgpt/service/core/agentSkills/controller', () => ({ importSkill: vi.fn() }));
vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: {
    resolveFormData: vi.fn(async () => ({
      data: {},
      fileMetadata: { path: '/tmp/skill-import-validation.zip', originalname: 'skill.zip' }
    })),
    clearDiskTempFiles: vi.fn()
  }
}));

const reasons = [
  'invalid_zip',
  'archive_too_large',
  'too_many_files',
  'file_too_large',
  'uncompressed_size_exceeded',
  'path_too_deep',
  'absolute_path',
  'path_traversal',
  'invalid_path',
  'duplicate_path',
  'unsupported_file_type',
  'unsupported_compression',
  'encrypted_entry',
  'invalid_utf8',
  'invalid_frontmatter',
  'missing_skill_md',
  'invalid_layout',
  'legacy_layout_not_allowed',
  'duplicate_runtime_name',
  'runtime_name_mismatch',
  'invalid_entrypoint',
  'checksum_mismatch'
] as const satisfies readonly validator.SkillPackageValidationReason[];

function makeRequest() {
  return Object.assign(new IncomingMessage(new Socket()), {
    method: 'POST',
    body: {},
    query: {},
    cookies: {},
    env: {}
  });
}

function makeResponse(request: IncomingMessage) {
  const response = Object.assign(new ServerResponse(request), {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    redirect: vi.fn(),
    setDraftMode: vi.fn(),
    setPreviewData: vi.fn(),
    clearPreviewData: vi.fn(),
    revalidate: vi.fn()
  });
  response.status.mockReturnValue(response);
  return response;
}

describe('Skill import validation response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fs, 'stat').mockResolvedValue(new Stats());
    vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('test archive'));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(reasons)(
    'returns a safe localized HTTP 400 for %s and removes the upload',
    async (reason) => {
      vi.spyOn(validator, 'validateAndNormalizeSkillPackage').mockRejectedValue(
        new validator.SkillPackageValidationError(reason, '/private/secret/<script>unsafe</script>')
      );
      const request = makeRequest();
      const response = makeResponse(request);

      await handler(request, response);

      expect(response.status).toHaveBeenCalledWith(400);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ERROR_RESPONSE[SkillErrEnum.invalidSkillPackage].code,
          message: `skill:package_error.${reason}`
        })
      );
      expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret');
      for (const translation of [zhCN, zhHant, en]) {
        expect(translation[`package_error.${reason}`]).toEqual(expect.any(String));
      }
      expect(importSkill).not.toHaveBeenCalled();
      expect(multer.clearDiskTempFiles).toHaveBeenCalledWith(['/tmp/skill-import-validation.zip']);
    }
  );

  it('keeps unexpected failures generic and removes the upload', async () => {
    vi.spyOn(validator, 'validateAndNormalizeSkillPackage').mockRejectedValue(
      new Error('/private/internal-secret')
    );
    const request = makeRequest();
    const response = makeResponse(request);
    const result = await handler(request, response);
    expect(result).toMatchObject({ error: SkillErrEnum.invalidSkillPackage });
    expect(JSON.stringify(result)).not.toContain('internal-secret');
    expect(importSkill).not.toHaveBeenCalled();
    expect(multer.clearDiskTempFiles).toHaveBeenCalledWith(['/tmp/skill-import-validation.zip']);
  });
});
