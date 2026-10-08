import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import SandboxIDE from '@/components/SandboxIDE';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { omniTheme } from '@/web/common/brand/theme';

const SandboxIframe = () => {
  const { t } = useTranslation();
  const entryUrl = useContextSelector(SkillDetailContext, (value) => value.sandboxEndpointUrl);
  return entryUrl ? (
    <SandboxIDE
      entryUrl={entryUrl}
      title="Skill workspace editor"
      toolbar={
        <Flex align="center" gap={3} flex={1} minW={0}>
          <Flex align="center" gap={2} flexShrink={0}>
            <Flex
              align="center"
              justify="center"
              w={8}
              h={8}
              borderRadius={omniTheme.radii.md}
              bg="primary.50"
              color="primary.600"
            >
              <MyIcon name="code" w={4} aria-hidden />
            </Flex>
            <Text fontSize="sm" fontWeight={600} color="myGray.900">
              {t('skill:editor_workspace_title')}
            </Text>
          </Flex>
          <Box h={4} borderLeft="base" flexShrink={0} aria-hidden />
          <Text
            fontSize="xs"
            color="myGray.500"
            minW={0}
            isTruncated
            title={t('skill:editor_advanced_hint')}
          >
            {t('skill:editor_save_hint')}
          </Text>
        </Flex>
      }
      actions={
        <MyTooltip
          label={t('skill:editor_advanced_hint')}
          shouldWrapChildren={false}
          closeOnClick={false}
        >
          <Button
            aria-label={t('skill:editor_help')}
            size="sm"
            variant="ghost"
            minW={8}
            w={8}
            h={8}
            p={0}
            borderRadius={omniTheme.radii.md}
            color="myGray.500"
            _hover={{ bg: 'myGray.100', color: 'myGray.700' }}
          >
            <MyIcon name="common/info" w={4} aria-hidden />
          </Button>
        </MyTooltip>
      }
    />
  ) : null;
};

export default React.memo(SandboxIframe);
