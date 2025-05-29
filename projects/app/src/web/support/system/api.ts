import { GET, POST } from '@/web/common/api/request';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';

export const getSystemConfig = () => GET<FastGPTConfigFileType>('/support/system/detail');

//创建SystemConfig
export const createSystemConfig = (data: FastGPTConfigFileType) =>
  POST('/support/system/create', data);
