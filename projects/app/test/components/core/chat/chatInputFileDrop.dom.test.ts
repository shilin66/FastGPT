import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChatBoxInputFormType,
  ChatBoxInputType
} from '@/components/core/chat/ChatContainer/ChatBox/type';

const mocks = vi.hoisted(() => ({
  onSelectFile: vi.fn(),
  toast: vi.fn(),
  contextValue: {
    InputLeftComponent: null,
    outLinkAuthData: {},
    appId: 'app-id',
    chatId: 'chat-id',
    isChatting: false,
    chatBoxData: {},
    whisperConfig: { open: false },
    chatInputGuide: { open: false, textList: [] },
    fileSelectConfig: {
      canSelectCustomFileExtension: true,
      customFileExtensionList: ['.custom']
    },
    dialogTips: '',
    autoTTSResponse: false
  }
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('use-context-selector', async () => {
  const react = await import('react');

  return {
    createContext: react.createContext,
    useContextSelector: (
      _context: unknown,
      selector: (value: typeof mocks.contextValue) => unknown
    ) => selector(mocks.contextValue)
  };
});
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: () => unknown) => ({ runAsync: request, loading: false })
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload', () => ({
  useFileUpload: () => ({
    File: () => null,
    fileType: '.custom',
    onOpenSelectFile: vi.fn(),
    fileList: [],
    onSelectFile: mocks.onSelectFile,
    uploadFiles: vi.fn(),
    selectFileIcon: undefined,
    selectFileLabel: 'select file',
    showSelectFile: false,
    showSelectImg: false,
    showSelectVideo: false,
    showSelectAudio: false,
    showSelectCustomFileExtension: true,
    removeFiles: vi.fn(),
    replaceFiles: vi.fn(),
    hasFileUploading: false
  })
}));
vi.mock('@/components/core/chat/ChatContainer/components/FilePreview', () => ({
  default: () => null
}));
vi.mock('@/components/common/ComplianceTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({
    children,
    onClick
  }: React.PropsWithChildren<{ onClick?: React.MouseEventHandler }>) =>
    React.createElement('button', { onClick }, children)
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox/Input/VoiceInput', async () => {
  const react = await import('react');

  return { default: react.forwardRef(() => null) };
});
vi.mock('@/web/core/chat/api', () => ({ postStopV2Chat: vi.fn() }));

import ChatInput from '@/components/core/chat/ChatContainer/ChatBox/Input/ChatInput';

const Harness = () => {
  const TextareaDom = useRef<HTMLTextAreaElement | null>(null);
  const chatForm = useForm<ChatBoxInputFormType>({
    defaultValues: { input: '', files: [] }
  });

  return React.createElement(ChatInput, {
    onSendMessage: vi.fn(),
    onStop: vi.fn(),
    TextareaDom,
    resetInputVal: vi.fn<(value: ChatBoxInputType) => void>(),
    chatForm
  });
};

describe('ChatInput custom-extension drop', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('passes a configured custom-extension file from drop to the upload handler', async () => {
    const customFile = new File(['custom content'], 'knowledge.custom');
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [customFile] }
    });

    await act(async () => {
      container.firstElementChild?.dispatchEvent(dropEvent);
    });

    expect(mocks.onSelectFile).toHaveBeenCalledExactlyOnceWith({ files: [customFile] });
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
