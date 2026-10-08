import React, { useEffect, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import PaneActionButton from '@/components/common/PaneActionButton';
import SandboxEditor from './Editor';
import { useSandboxFilePanel } from './PanelContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import ChatIDE from './ChatIDE';
import { WorkspaceTabs } from './WorkspaceTabs';
import MyIcon from '@fastgpt/web/components/common/Icon';

const SandboxFilePanel = ({ headerHeight = 48 }: { headerHeight?: number }) => {
  const { t } = useTranslation();
  const panel = useSandboxFilePanel();
  const [newFiles, setNewFiles] = useState(0);
  const [selectedView, setSelectedView] = useState<{ scopeId: string; value: 'files' | 'ide' }>({
    scopeId: '',
    value: 'files'
  });
  const editorEnabled = useSystemStore(
    (state) => !!state.feConfigs.show_agent_sandbox && !!state.feConfigs.show_agent_sandbox_editor
  );
  const loggedIn = useUserStore((state) => !!state.userInfo?._id);
  const canOpenIDE =
    editorEnabled &&
    loggedIn &&
    !!panel?.scope &&
    !Object.values(panel.scope.outLinkAuthData ?? {}).some(Boolean);
  const scopeId = panel?.scope
    ? JSON.stringify([panel.scope.appId, panel.scope.chatId, panel.scope.sandboxId])
    : '';
  const view = selectedView.scopeId === scopeId ? selectedView.value : 'files';
  const setView = (value: 'files' | 'ide') => setSelectedView({ scopeId, value });
  const panelIsOpen = panel?.isOpen;
  const refreshPanel = panel?.refresh;

  useEffect(() => {
    setNewFiles(0);
  }, [scopeId]);

  useEffect(() => {
    if (!panelIsOpen || !canOpenIDE) setSelectedView({ scopeId, value: 'files' });
  }, [panelIsOpen, canOpenIDE, scopeId]);

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
  const selectView = (next: 'files' | 'ide') => {
    if (next === 'files' && view !== 'files') panel.refresh();
    if (next === 'ide') panel.expand();
    setView(next);
  };

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
      sx={{ containerType: 'inline-size' }}
    >
      <Flex
        h={`${headerHeight}px`}
        minH={`${headerHeight}px`}
        px={4}
        align={'center'}
        gap={3}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
        sx={{
          '@container (max-width: 540px)': { h: 'auto', flexWrap: 'wrap', py: 3 }
        }}
      >
        <MyIcon name={'code'} w={5} h={5} color={'primary.600'} flexShrink={0} />
        <Text fontSize={'14px'} fontWeight={600} color={'myGray.800'} flexShrink={0}>
          {t(canOpenIDE ? 'chat:sandbox_workspace' : 'chat:sandbox_files')}
          {newFiles > 0 && (
            <Text as={'span'} ml={2} color={'primary.600'}>
              +{newFiles}
            </Text>
          )}
        </Text>
        {canOpenIDE && <WorkspaceTabs view={view} onSelect={selectView} />}
        <Box flex={1} />
        {view === 'files' && (
          <PaneActionButton
            action="refresh"
            label={String(t('chat:sandbox_refresh'))}
            onClick={() => {
              setNewFiles(0);
              panel.refresh({ allowStart: true });
            }}
          />
        )}
        <PaneActionButton
          action={panel.isExpanded ? 'restore' : 'expand'}
          label={String(t(panel.isExpanded ? 'chat:sandbox_restore' : 'chat:sandbox_expand'))}
          aria-expanded={panel.isExpanded}
          onClick={panel.toggleExpanded}
        />
        <PaneActionButton action="close" label={String(t('common:Close'))} onClick={panel.close} />
      </Flex>
      <Box
        id="sandbox-files-view"
        role={canOpenIDE ? 'tabpanel' : undefined}
        aria-labelledby={canOpenIDE ? 'sandbox-files-tab' : undefined}
        display={view === 'files' ? 'block' : 'none'}
        flex={1}
        minH={0}
      >
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
      {canOpenIDE && panel.isOpen && panel.scope && (
        <Box
          id="sandbox-ide-view"
          role="tabpanel"
          aria-labelledby="sandbox-ide-tab"
          display={view === 'ide' ? 'block' : 'none'}
          flex={1}
          minH={0}
        >
          <ChatIDE key={scopeKey} scope={panel.scope} selected={view === 'ide'} />
        </Box>
      )}
    </Flex>
  );
};

export default SandboxFilePanel;
