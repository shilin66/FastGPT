import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertTeamWritable } from '@fastgpt/service/support/user/team/status';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamSkillCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { importSkill } from '@fastgpt/service/core/agentSkills/controller';
import {
  SkillPackageValidationError,
  type SkillPackageValidationReason,
  validateAndNormalizeSkillPackage
} from '@fastgpt/service/core/agentSkills/packageValidator';
import type { ImportSkillBody, ImportSkillResponse } from '@fastgpt/global/core/agentSkills/api';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { multer } from '@fastgpt/service/common/file/multer';
import { getSkillSizeLimits } from '@fastgpt/service/core/agentSkills/sandboxConfig';
import fs from 'fs/promises';
import { addAuditLog, getI18nSkillType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { i18nT } from '@fastgpt/web/i18n/utils';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.IMPORT);

const validationMessages = {
  invalid_zip: i18nT('skill:package_error.invalid_zip'),
  archive_too_large: i18nT('skill:package_error.archive_too_large'),
  too_many_files: i18nT('skill:package_error.too_many_files'),
  file_too_large: i18nT('skill:package_error.file_too_large'),
  uncompressed_size_exceeded: i18nT('skill:package_error.uncompressed_size_exceeded'),
  path_too_deep: i18nT('skill:package_error.path_too_deep'),
  absolute_path: i18nT('skill:package_error.absolute_path'),
  path_traversal: i18nT('skill:package_error.path_traversal'),
  invalid_path: i18nT('skill:package_error.invalid_path'),
  duplicate_path: i18nT('skill:package_error.duplicate_path'),
  unsupported_file_type: i18nT('skill:package_error.unsupported_file_type'),
  unsupported_compression: i18nT('skill:package_error.unsupported_compression'),
  encrypted_entry: i18nT('skill:package_error.encrypted_entry'),
  invalid_utf8: i18nT('skill:package_error.invalid_utf8'),
  invalid_frontmatter: i18nT('skill:package_error.invalid_frontmatter'),
  missing_skill_md: i18nT('skill:package_error.missing_skill_md'),
  invalid_layout: i18nT('skill:package_error.invalid_layout'),
  legacy_layout_not_allowed: i18nT('skill:package_error.legacy_layout_not_allowed'),
  duplicate_runtime_name: i18nT('skill:package_error.duplicate_runtime_name'),
  runtime_name_mismatch: i18nT('skill:package_error.runtime_name_mismatch'),
  invalid_entrypoint: i18nT('skill:package_error.invalid_entrypoint'),
  checksum_mismatch: i18nT('skill:package_error.checksum_mismatch')
} satisfies Record<SkillPackageValidationReason, string>;

export const config = {
  api: {
    bodyParser: false
  }
};

async function handler(
  req: ApiRequestProps<ImportSkillBody>,
  res: NextApiResponse
): Promise<ImportSkillResponse | void> {
  const filepaths: string[] = [];

  try {
    const { teamId: requestTeamId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });
    await assertTeamWritable(requestTeamId, WritePermissionVal);

    // Read env limit before multer so both use the same value
    const { maxUploadBytes: maxArchiveSize } = getSkillSizeLimits();
    // Convert bytes to MB for multer (multer expects MB)
    const maxArchiveSizeMB = Math.ceil(maxArchiveSize / 1024 / 1024);

    const result = await multer.resolveFormData<ImportSkillBody>({
      request: req,
      maxFileSize: maxArchiveSizeMB
    });

    filepaths.push(result.fileMetadata.path);

    const file = result.fileMetadata;
    // Support both JSON-wrapped body ({"data": "..."}) and plain multipart form fields
    const body: ImportSkillBody = {
      parentId: result.data.parentId ?? (req.body?.parentId as string | undefined),
      name: result.data.name ?? (req.body?.name as string | undefined),
      description: result.data.description ?? (req.body?.description as string | undefined),
      avatar: result.data.avatar ?? (req.body?.avatar as string | undefined)
    };

    if (!/\.zip$/i.test(file.originalname ?? '')) {
      return Promise.reject(SkillErrEnum.invalidArchiveFormat);
    }

    // Authenticate user and check permission
    let teamId: string;
    let tmbId: string;
    let userId: string | undefined;

    if (body.parentId) {
      // If importing into a folder, check write permission on the parent folder
      const authResult = await authSkill({
        req,
        authToken: true,
        authApiKey: true,
        skillId: body.parentId,
        per: WritePermissionVal
      });
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;
      userId = authResult.userId;
    } else {
      // If importing to root, check team-level skill create permission
      const authResult = await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamSkillCreatePermissionVal
      });
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;
      userId = authResult.userId;
    }

    // Check archive size (multer already enforces the limit, this is a secondary guard)
    const stats = await fs.stat(file.path);
    if (stats.size > maxArchiveSize) {
      logger.warn('Archive file size exceeds maximum', {
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        maxMB: (maxArchiveSize / 1024 / 1024).toFixed(2)
      });
      return Promise.reject(SkillErrEnum.archiveTooLarge);
    }

    const archiveBuffer = await fs.readFile(file.path);
    let validatedPackage;
    try {
      validatedPackage = await validateAndNormalizeSkillPackage(archiveBuffer);
    } catch (error) {
      logger.warn('Rejected imported Skill package', {
        reason:
          error instanceof SkillPackageValidationError
            ? error.reason
            : 'unexpected_validation_error'
      });
      if (error instanceof SkillPackageValidationError) {
        return jsonRes(res, {
          code: 400,
          error: SkillErrEnum.invalidSkillPackage,
          message: validationMessages[error.reason]
        });
      }
      return Promise.reject(SkillErrEnum.invalidSkillPackage);
    }

    // Derive package-level name from caller-supplied value or archive filename
    const pkgName =
      body.name || (file.originalname ?? 'package').replace(/\.zip$/i, '').trim() || 'package';
    const pkgDescription = body.description ?? '';

    const skillId = await importSkill({
      name: pkgName,
      description: pkgDescription,
      avatar: body.avatar,
      teamId,
      tmbId,
      userId: userId || '',
      parentId: body.parentId || null,
      originalFilename: file.originalname || 'package.zip',
      validatedPackage
    });

    // Add audit log
    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.IMPORT_SKILL,
        params: {
          skillName: pkgName,
          skillType: getI18nSkillType(AgentSkillTypeEnum.skill)
        }
      });
    })();

    return skillId;
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);
