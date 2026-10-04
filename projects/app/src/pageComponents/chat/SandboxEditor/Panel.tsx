import React, { useEffect, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import PaneActionButton from '@/components/common/PaneActionButton';
import SandboxEditor from './Editor';
import { useSandboxFilePanel } from './PanelContext';

const SandboxFilePanel = ({ headerHeight = 48 }: { headerHeight?: number }) => {
  const { t } = useTranslation();
  const panel = useSandboxFilePanel();
  const [newFiles, setNewFiles] = useState(0);
  const scopeId = panel?.scope
    ? JSON.stringify([panel.scope.appId, panel.scope.chatId, panel.scope.sandboxId])
    : '';
  const panelIsOpen = panel?.isOpen;
  const refreshPanel = panel?.refresh;

  useEffect(() => {
    setNewFiles(0);
  }, [scopeId]);

  useEffect(() => {
    if (!panelIsOpen || !refreshPanel) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refreshPanel();
    };
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
    };
  }, [panelIsOpen, refreshPanel]);

  if (!panel) return null;

  const scopeKey = scopeId;

  return (
    <Flex
      direction={'column'}
      h={'full'}
      minW={0}
      bg={'white'}
      borderLeft={'1px solid'}
      borderColor={'myGray.200'}
      w={'full'}
      display={panel.isOpen ? 'flex' : 'none'}
    >
      <Flex
        h={`${headerHeight}px`}
        minH={`${headerHeight}px`}
        px={3}
        align={'center'}
        gap={2}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Text fontSize={'14px'} fontWeight={600} flex={1} noOfLines={1}>
          {t('chat:sandbox_files')}
          {newFiles > 0 && (
            <Text as={'span'} ml={2} color={'primary.600'}>
              +{newFiles}
            </Text>
          )}
        </Text>
        <PaneActionButton
          action="refresh"
          label={String(t('chat:sandbox_refresh'))}
          onClick={() => {
            setNewFiles(0);
            panel.refresh({ allowStart: true });
          }}
        />
        <PaneActionButton
          action={panel.isExpanded ? 'restore' : 'expand'}
          label={String(t(panel.isExpanded ? 'chat:sandbox_restore' : 'chat:sandbox_expand'))}
          aria-expanded={panel.isExpanded}
          onClick={panel.toggleExpanded}
        />
        <PaneActionButton action="close" label={String(t('common:Close'))} onClick={panel.close} />
      </Flex>
      <Box flex={1} minH={0}>
        {panel.scope && (
          <SandboxEditor
            key={scopeKey}
            {...panel.scope}
            refreshVersion={panel.refreshVersion}
            allowStartVersion={panel.allowStartVersion}
            onNewFiles={setNewFiles}
            onRequestExpand={panel.expand}
            panelMode
          />
        )}
      </Box>
    </Flex>
  );
};

export default SandboxFilePanel;
