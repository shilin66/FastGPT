import type { SystemMsgModalValueType as SystemMessage } from '@fastgpt/global/openapi/admin/support/user/inform/api';
import type { LicenseExpiryState } from '@fastgpt/global/common/system/licenseExpiry';

export type SystemMsgModalValueType = NonNullable<SystemMessage> & {
  licenseExpiryState?: LicenseExpiryState;
};
