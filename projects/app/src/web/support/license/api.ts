import { GET, POST } from '@/web/common/api/request';
import type { LicenseDataType } from '@fastgpt/global/common/system/types';

export const getLicenseData = () => GET<LicenseDataType>('/support/license/detail');

//创建SystemConfig
export const createLicenseData = (data: LicenseDataType) => POST('/support/license/create', data);
