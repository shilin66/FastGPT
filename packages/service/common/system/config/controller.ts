import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoSystemConfigs } from './schema';
import { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';

export const getFastGPTConfigFromDB = async () => {
  // if (!FastGPTProUrl) return {} as FastGPTConfigFileType;

  const res = await MongoSystemConfigs.findOne({
    type: SystemConfigsTypeEnum.fastgpt
  }).sort({
    createTime: -1
  });

  const config = res?.value || {};

  return config as FastGPTConfigFileType;
};

export const initFastGPTConfigToDB = async (config: FastGPTConfigFileType) => {
  await MongoSystemConfigs.create({
    type: SystemConfigsTypeEnum.fastgpt,
    value: config
  });
};
