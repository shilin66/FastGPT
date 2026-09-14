import React from 'react';
import { Flex, Box, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext, TabEnum } from './context';
import BuildingAnimation from './config/BuildingAnimation';
import SandboxTerminal from './config/SandboxTerminal';
import SandboxIframe from './config/SandboxIframe';
import SandboxError from './config/SandboxError';
import SkillPreview from './preview/SkillPreview';
import WorkspaceStatus from './WorkspaceStatus';

const SkillBuilding = () => {
  const { t } = useTranslation();

  return (
    <Flex h={'100%'} alignItems={'center'} justifyContent={'center'} flexDirection={'column'}>
      <BuildingAnimation />
      <Box mt={'20px'} color={'myGray.500'} fontSize={'sm'}>
        {t('skill:generating')}
      </Box>
    </Flex>
  );
};

const Content = () => {
  const { t } = useTranslation();
  const { currentTab, sandboxState, canEdit, skillDetail, skillDetailError, refreshSkillDetail } =
    useContextSelector(SkillDetailContext, (v) => ({
      currentTab: v.currentTab,
      sandboxState: v.sandboxState,
      canEdit: v.skillDetail?.permission.hasWritePer,
      skillDetail: v.skillDetail,
      skillDetailError: v.skillDetailError,
      refreshSkillDetail: v.refreshSkillDetail
    }));

  if (!skillDetail)
    return (
      <Flex flex={1} align="center" justify="center" direction="column" gap={3}>
        <Box>{skillDetailError ? t('skill:workspace_detail_failed') : t('common:Loading')}</Box>
        {skillDetailError && (
          <Button onClick={refreshSkillDetail}>{t('skill:sandbox_retry')}</Button>
        )}
      </Flex>
    );

  return (
    <Box
      flex={1}
      bg={'white'}
      borderRadius={'8px'}
      border={'1px solid #EBEDF0'}
      overflow={'hidden'}
    >
      <Flex
        h={'100%'}
        flexDirection="column"
        display={currentTab === TabEnum.config ? 'flex' : 'none'}
      >
        <WorkspaceStatus />
        <Box flex={1} minH={0}>
          {!canEdit ? (
            <Flex h="100%" align="center" justify="center" color="myGray.500">
              {t('skill:workspace_read_only')}
            </Flex>
          ) : (
            <>
              {sandboxState === 'idle' && <SkillBuilding />}
              {sandboxState === 'loading' && <SandboxTerminal />}
              {sandboxState === 'ready' && <SandboxIframe />}
              {sandboxState === 'failed' && <SandboxError />}
            </>
          )}
        </Box>
      </Flex>
      <Box h={'100%'} display={currentTab === TabEnum.preview ? 'block' : 'none'}>
        {canEdit ? (
          <SkillPreview />
        ) : (
          <Flex h="100%" align="center" justify="center" color="myGray.500">
            {t('skill:workspace_read_only')}
          </Flex>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(Content);
