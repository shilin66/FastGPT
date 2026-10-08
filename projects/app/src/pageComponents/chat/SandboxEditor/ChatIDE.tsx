import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Spinner, Text } from '@chakra-ui/react';
import Router from 'next/router';
import { useTranslation } from 'next-i18next';
import SandboxIDE from '@/components/SandboxIDE';
import { sandboxEditorDisconnectEvent } from '@/components/SandboxIDE/navigation';
import type { SandboxEditorResponse } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import type { SandboxPanelScope } from './PanelContext';
import { openSandboxEditor } from './api';
import MyIcon from '@fastgpt/web/components/common/Icon';

const errorKeys: Record<string, string> = {
  sandbox_editor_not_found: 'sandbox_ide_not_found',
  sandbox_editor_unsupported: 'sandbox_ide_unsupported',
  sandbox_editor_binding_changed: 'sandbox_ide_replaced',
  sandbox_editor_recovery_required: 'sandbox_ide_recovery_required',
  sandbox_editor_busy: 'sandbox_ide_busy',
  sandbox_editor_forbidden: 'sandbox_ide_forbidden',
  sandbox_editor_login_required: 'sandbox_ide_login_required',
  sandbox_editor_disabled: 'sandbox_ide_disabled',
  sandbox_editor_start_timeout: 'sandbox_ide_timeout'
};

const ChatIDE = ({ scope, selected }: { scope: SandboxPanelScope; selected: boolean }) => {
  const { t } = useTranslation();
  const [editor, setEditor] = useState<SandboxEditorResponse>();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string>();
  const requested = useRef(false);
  const connected = useRef(false);
  const pending = useRef<AbortController>();
  const open = useCallback(async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setPreparing(true);
    setError(undefined);
    try {
      const result = await openSandboxEditor(
        { appId: scope.appId, chatId: scope.chatId, sandboxId: scope.sandboxId },
        controller
      );
      if (!controller.signal.aborted) {
        connected.current = true;
        setEditor(result);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const code =
          cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '';
        setError(errorKeys[code] ?? 'sandbox_ide_unavailable');
      }
    } finally {
      if (pending.current === controller) {
        pending.current = undefined;
        if (!controller.signal.aborted) setPreparing(false);
      }
    }
  }, [scope.appId, scope.chatId, scope.sandboxId]);
  const disconnect = useCallback(() => {
    connected.current = false;
    pending.current?.abort();
    pending.current = undefined;
    setPreparing(false);
    setEditor(undefined);
  }, []);
  const confirmDisconnect = useCallback(
    () => !connected.current || window.confirm(String(t('chat:sandbox_ide_save_confirm'))),
    [t]
  );

  useEffect(() => {
    if (selected && !requested.current) {
      requested.current = true;
      void open();
    }
  }, [selected, open]);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = undefined;
    },
    []
  );
  useEffect(() => {
    const beforeDisconnect = (event: Event) => {
      if (!confirmDisconnect()) {
        event.preventDefault();
        return;
      }
      disconnect();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (editor) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const routeChange = () => {
      if (!connected.current) return;
      if (confirmDisconnect()) {
        disconnect();
        return;
      }
      const error = Object.assign(new Error('Sandbox editor navigation cancelled'), {
        cancelled: true
      });
      Router.events.emit('routeChangeError', error);
      throw error;
    };
    window.addEventListener(sandboxEditorDisconnectEvent, beforeDisconnect);
    window.addEventListener('beforeunload', beforeUnload);
    Router.events.on('routeChangeStart', routeChange);
    return () => {
      window.removeEventListener(sandboxEditorDisconnectEvent, beforeDisconnect);
      window.removeEventListener('beforeunload', beforeUnload);
      Router.events.off('routeChangeStart', routeChange);
    };
  }, [editor, confirmDisconnect, disconnect]);

  const toolbar = (
    <Flex gap={2} align={'center'} flex={1} minW={0}>
      <MyIcon name={'file/fill/folder'} w={4} h={4} color={'myGray.500'} flexShrink={0} />
      <Text
        fontSize={'xs'}
        color={'myGray.600'}
        flex={1}
        minW={0}
        noOfLines={1}
        title={editor?.directory}
        fontFamily={editor ? 'mono' : undefined}
      >
        {editor?.directory ?? t('chat:sandbox_ide_hint')}
      </Text>
    </Flex>
  );
  const actions = (
    <Button
      size={'xs'}
      h={'30px'}
      px={3}
      flexShrink={0}
      borderRadius={'8px'}
      variant={editor ? 'whiteBase' : 'primary'}
      isDisabled={preparing}
      _hover={editor ? { color: 'red.600', borderColor: 'red.200', bg: 'red.50' } : undefined}
      onClick={
        editor
          ? () => {
              if (confirmDisconnect()) disconnect();
            }
          : open
      }
    >
      {t(editor ? 'chat:sandbox_ide_disconnect' : 'chat:sandbox_ide_connect')}
    </Button>
  );

  return (
    <Flex direction={'column'} h={'full'} minH={0}>
      {!editor && (
        <Flex px={4} py={2} gap={3} align={'center'} borderBottom={'base'} bg={'myGray.50'}>
          {toolbar}
          {actions}
        </Flex>
      )}
      {editor?.persistence === 'container' && (
        <Text px={3} py={1} fontSize={'xs'} color={'orange.600'}>
          {t('chat:sandbox_ide_container_storage')}
        </Text>
      )}
      <Box flex={1} minH={0}>
        {editor ? (
          <SandboxIDE
            entryUrl={editor.entryUrl}
            title="Agent workspace editor"
            toolbar={toolbar}
            actions={actions}
          />
        ) : (
          <Flex h={'full'} direction={'column'} align={'center'} justify={'center'} gap={3} px={6}>
            {preparing && <Spinner size={'sm'} />}
            <Text
              fontSize={'sm'}
              color={error ? 'red.600' : 'myGray.600'}
              textAlign={'center'}
              role={error ? 'alert' : 'status'}
            >
              {t(
                `chat:${preparing ? 'sandbox_ide_preparing' : error ?? 'sandbox_ide_disconnected'}` as 'chat:sandbox_ide_preparing'
              )}
            </Text>
            {!preparing && (
              <Text fontSize={'xs'} color={'myGray.500'} textAlign={'center'}>
                {t('chat:sandbox_ide_hint')}
              </Text>
            )}
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

export default ChatIDE;
