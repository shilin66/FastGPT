import type { OpenAPIPath } from '../../type';
import { LicenseExpiryNoticeSchema } from '../../../common/system/licenseExpiry';
import { TagsMap } from '../../tag';

export const LicensePath: OpenAPIPath = {
  '/api/support/license/expiryNotice': {
    get: {
      summary: '获取授权到期提醒',
      description: '登录用户读取当前 30、15 或 7 天阶段的授权到期提醒，无提醒时返回 null。',
      tags: [TagsMap.userInform],
      responses: {
        200: {
          description: '当前授权提醒，或 null',
          content: { 'application/json': { schema: LicenseExpiryNoticeSchema.nullable() } }
        }
      }
    }
  }
};
