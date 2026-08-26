import React from 'react';
import { Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { getNodeTemplateTabs, type TemplateTypeEnum } from './header';

type Props = {
  readonly templateType: TemplateTypeEnum;
  readonly onUpdateTemplateType: (type: TemplateTypeEnum) => void;
  readonly onClose: () => void;
};

const NodeTemplateTypeRail = ({ templateType, onUpdateTemplateType, onClose }: Props) => {
  const { t } = useTranslation();
  const tabs = getNodeTemplateTabs(t);

  return (
    <Flex
      w={'52px'}
      flexShrink={0}
      flexDirection={'column'}
      alignItems={'center'}
      py={2.5}
      px={2}
      borderRight={'1px solid #DFE5EE'}
      bg={'#F4F7FB'}
    >
      <Flex
        w={'36px'}
        h={'36px'}
        mb={3.5}
        alignItems={'center'}
        justifyContent={'center'}
        borderRadius={'7px'}
        bg={'#27364A'}
      >
        <MyIcon name={'core/modules/basicNode'} w={'17px'} color={'white'} />
      </Flex>

      {tabs.map((tab) => {
        const isActive = tab.value === templateType;

        return (
          <MyTooltip key={tab.value} label={tab.label} placement={'right'}>
            <IconButton
              aria-label={tab.label}
              aria-pressed={isActive}
              icon={<MyIcon name={tab.icon} w={'16px'} />}
              w={'36px'}
              minW={'36px'}
              h={'36px'}
              mb={1.5}
              borderRadius={'7px'}
              color={isActive ? 'white' : '#667085'}
              bg={isActive ? '#2563EB' : 'transparent'}
              boxShadow={isActive ? '0 8px 18px rgba(37, 99, 235, 0.22)' : 'none'}
              _hover={{
                color: isActive ? 'white' : '#2563EB',
                bg: isActive ? '#2563EB' : '#E7EFFD'
              }}
              onClick={() => onUpdateTemplateType(tab.value)}
            />
          </MyTooltip>
        );
      })}

      <MyTooltip label={t('workflow:node_templates.close')} placement={'right'}>
        <IconButton
          aria-label={t('workflow:node_templates.close')}
          icon={<MyIcon name={'common/leftArrowLight'} w={'15px'} />}
          w={'36px'}
          minW={'36px'}
          h={'36px'}
          mt={'auto'}
          borderRadius={'7px'}
          color={'#667085'}
          bg={'transparent'}
          _hover={{ color: '#2563EB', bg: '#E7EFFD' }}
          onClick={onClose}
        />
      </MyTooltip>
    </Flex>
  );
};

export default React.memo(NodeTemplateTypeRail);
