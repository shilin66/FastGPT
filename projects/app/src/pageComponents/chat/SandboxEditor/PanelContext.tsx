import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { createContext, useContextSelector } from 'use-context-selector';

export type SandboxPanelScope = {
  appId: string;
  chatId: string;
  sandboxId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
};

type PanelContextValue = {
  isOpen: boolean;
  isExpanded: boolean;
  isAutoOpened: boolean;
  scope?: SandboxPanelScope;
  refreshVersion: number;
  allowStartVersion: number;
  open: (scope: SandboxPanelScope, options?: { automatic?: boolean }) => void;
  close: () => void;
  refresh: (options?: { allowStart?: boolean }) => void;
  expand: () => void;
  restore: () => void;
  toggleExpanded: () => void;
  markManuallyResized: () => void;
};

const SandboxFilePanelContext = createContext<PanelContextValue | null>(null);

export const useSandboxFilePanel = () =>
  useContextSelector(SandboxFilePanelContext, (value) => value);
export const useSandboxFilePanelOpener = () =>
  useContextSelector(SandboxFilePanelContext, (value) => value?.open);

export const SandboxFilePanelProvider = ({
  scopeKey,
  children
}: {
  scopeKey: string;
  children: React.ReactNode;
}) => {
  const [scope, setScope] = useState<SandboxPanelScope>();
  const [openedScopeKey, setOpenedScopeKey] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAutoOpened, setIsAutoOpened] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [allowStartVersion, setAllowStartVersion] = useState(0);

  useEffect(() => {
    setIsOpen(false);
    setIsExpanded(false);
    setIsAutoOpened(false);
    setScope(undefined);
    setOpenedScopeKey(undefined);
  }, [scopeKey]);

  const open = useCallback(
    (nextScope: SandboxPanelScope, options?: { automatic?: boolean }) => {
      setScope(nextScope);
      setOpenedScopeKey(scopeKey);
      setIsOpen(true);
      setIsExpanded(false);
      setIsAutoOpened(!!options?.automatic);
      setRefreshVersion((value) => value + 1);
      setAllowStartVersion((value) => value + 1);
    },
    [scopeKey]
  );
  const close = useCallback(() => {
    setIsOpen(false);
    setIsExpanded(false);
  }, []);
  const refresh = useCallback((options?: { allowStart?: boolean }) => {
    if (options?.allowStart) setAllowStartVersion((value) => value + 1);
    setRefreshVersion((value) => value + 1);
  }, []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const restore = useCallback(() => setIsExpanded(false), []);
  const toggleExpanded = useCallback(() => setIsExpanded((value) => !value), []);
  const markManuallyResized = useCallback(() => setIsAutoOpened(false), []);

  const scopeMatches = openedScopeKey === scopeKey;
  const value = useMemo(
    () => ({
      isOpen: isOpen && scopeMatches,
      isExpanded: isOpen && scopeMatches && isExpanded,
      isAutoOpened: isOpen && scopeMatches && isAutoOpened,
      scope: scopeMatches ? scope : undefined,
      refreshVersion,
      allowStartVersion,
      open,
      close,
      refresh,
      expand,
      restore,
      toggleExpanded,
      markManuallyResized
    }),
    [
      isOpen,
      isExpanded,
      isAutoOpened,
      scopeMatches,
      scope,
      refreshVersion,
      allowStartVersion,
      open,
      close,
      refresh,
      expand,
      restore,
      toggleExpanded,
      markManuallyResized
    ]
  );

  return (
    <SandboxFilePanelContext.Provider value={value}>{children}</SandboxFilePanelContext.Provider>
  );
};
