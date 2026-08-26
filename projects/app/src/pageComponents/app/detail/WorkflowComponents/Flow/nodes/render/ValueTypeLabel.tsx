import { getFlowValueTypeMeta } from '@fastgpt/global/core/workflow/node/constant';
import type { BoxProps } from '@chakra-ui/react';
import { Box } from '@chakra-ui/react';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React from 'react';
import { useTranslation } from 'next-i18next';

const ValueTypeLabel = ({
  valueType,
  valueDesc,
  ...props
}: {
  valueType?: WorkflowIOValueTypeEnum;
  valueDesc?: string;
} & BoxProps) => {
  const { t } = useTranslation();
  const label = valueType ? getFlowValueTypeMeta(valueType).label : '';

  return !!label ? (
    <MyTooltip label={valueDesc}>
      <Box
        bg={'rgba(37, 99, 235, 0.07)'}
        color={'#2563EB'}
        border={'1px solid'}
        borderColor={'rgba(37, 99, 235, 0.16)'}
        borderRadius={'8px'}
        ml={2}
        px={1.5}
        h={'20px'}
        display={'flex'}
        alignItems={'center'}
        fontSize={'10px'}
        fontWeight={800}
        {...props}
      >
        {t(label as any)}
      </Box>
    </MyTooltip>
  ) : null;
};

export default React.memo(ValueTypeLabel);
