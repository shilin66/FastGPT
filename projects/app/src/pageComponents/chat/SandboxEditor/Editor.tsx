import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Box, Button, Center, Spinner, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type Editor from '@monaco-editor/react';
import { listSandboxFiles, writeSandboxFile, downloadSandbox, getSandboxFile } from './api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useLatest, useSize } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

import FileTree, { type TreeNode } from './components/FileTree';
import FileTabs, { type OpenedFile } from './components/FileTabs';
import EditorContent from './components/EditorContent';
import { getLanguageByFileName, updateTreeNode, filterTree, getIsBinaryByLanguage } from './utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { createSandboxFileRequestQueue, isSandboxFileBusyError } from './requestQueue';
import PaneActionButton from '@/components/common/PaneActionButton';
import ResizeDivider from './ResizeDivider';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

const collectPaths = (nodes: TreeNode[]): Set<string> => {
  const paths = new Set<string>();
  for (const node of nodes) {
    paths.add(node.path);
    if (node.children) for (const path of collectPaths(node.children)) paths.add(path);
  }
  return paths;
};

export type Props = {
  appId: string;
  chatId: string;
  sandboxId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  refreshVersion?: number;
  allowStartVersion?: number;
  onNewFiles?: (count: number) => void;
  onRequestExpand?: () => void;
  panelMode?: boolean;
};

const SandboxEditor = ({
  appId,
  chatId,
  sandboxId,
  outLinkAuthData,
  refreshVersion,
  allowStartVersion,
  onNewFiles,
  onRequestExpand,
  panelMode = false
}: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useSize(containerRef);
  const compact = panelMode && (size?.width ?? 0) < 720;
  const [compactView, setCompactView] = useState<'tree' | 'file'>('tree');
  const [treeWidth, setTreeWidth] = useState(224);
  useEffect(() => {
    const storedWidth = Number(localStorage.getItem('sandbox_file_tree_width'));
    if (Number.isFinite(storedWidth) && storedWidth > 0) setTreeWidth(storedWidth);
  }, []);
  const editorRef = useRef<EditorInstance>();
  const isUpdatingRef = useRef(false); // 防止循环更新
  const activeSandboxId = useRef(sandboxId);
  const activeWorkspaceGeneration = useRef<string>();
  const [waiting, setWaiting] = useState(false);
  const fileRequests = useRef(createSandboxFileRequestQueue(setWaiting)).current;

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const previousPaths = useRef<Set<string>>();
  const hasLoaded = useRef(false);
  const startAttempted = useRef(false);
  const lastAllowStartVersion = useRef(allowStartVersion);
  if (lastAllowStartVersion.current !== allowStartVersion) {
    lastAllowStartVersion.current = allowStartVersion;
    startAttempted.current = false;
  }
  const [loadError, setLoadError] = useState<'chat:sandbox_busy' | 'chat:sandbox_load_failed'>();
  const [retryVersion, setRetryVersion] = useState(0);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const expandedDirsRef = useLatest(expandedDirs);
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const directoryRequests = useRef(new Map<string, number>());
  const [searchQuery, setSearchQuery] = useState('');

  // 多标签页状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [openingFilePath, setOpeningFilePath] = useState<string>();
  const openingRequestId = useRef(0);
  const treeOnly = panelMode && !activeFilePath && !openingFilePath;
  const actualTreeWidth = Math.max(160, Math.min(treeWidth, (size?.width ?? 760) - 328));
  const moveTree = useCallback(
    (delta: number) => {
      const next = Math.max(160, Math.min(actualTreeWidth + delta, (size?.width ?? 760) - 328));
      setTreeWidth(next);
      localStorage.setItem('sandbox_file_tree_width', String(next));
    },
    [actualTreeWidth, size?.width]
  );

  const activeFile = useMemoEnhance(() => {
    return openedFiles.find((f) => f.path === activeFilePath);
  }, [openedFiles, activeFilePath]);

  const openedFilesRef = useLatest(openedFiles);
  const activeFileRef = useLatest(activeFile);
  const activeFilePathRef = useLatest(activeFilePath);
  const stalePaths = useRef(new Set<string>());
  const blobUrls = useRef(new Set<string>());
  const revokeBlobUrl = useCallback((url: string) => {
    if (!url.startsWith('blob:')) return;
    URL.revokeObjectURL(url);
    blobUrls.current.delete(url);
  }, []);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    const urls = blobUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  // Directory loads overlap with refreshes and folder clicks. ahooks runAsync abandons
  // earlier promises when a later call starts, leaving their loading state stuck.
  const loadDirectory = useCallback(
    async (
      path: string,
      level: number,
      priority: 'interactive' | 'background' = 'interactive',
      signal?: AbortSignal
    ): Promise<TreeNode[]> => {
      let requestId = 0;
      const allowStart = path === '.' && !startAttempted.current;
      const data = await fileRequests(
        () => {
          requestId = (directoryRequests.current.get(path) ?? 0) + 1;
          directoryRequests.current.set(path, requestId);
          const requestAllowStart = allowStart && !startAttempted.current;
          if (requestAllowStart) startAttempted.current = true;
          return listSandboxFiles({
            appId,
            chatId,
            sandboxId: activeSandboxId.current,
            outLinkAuthData,
            path,
            allowStart: requestAllowStart
          });
        },
        { mode: allowStart ? 'exclusive' : 'read', priority, signal }
      );
      const nodes: TreeNode[] = (data.files || []).map((file) => ({
        ...file,
        level,
        children: file.type === 'directory' ? [] : undefined,
        loaded: false // 子目录初始未加载
      }));
      if (signal?.aborted || directoryRequests.current.get(path) !== requestId) return nodes;
      activeSandboxId.current = data.sandboxId ?? activeSandboxId.current;
      if (path === '.') {
        const generation = data.workspaceGeneration ?? 'legacy';
        if (activeWorkspaceGeneration.current && activeWorkspaceGeneration.current !== generation) {
          setOpenedFiles((current) => current.map((file) => ({ ...file, remoteChanged: true })));
        }
        activeWorkspaceGeneration.current = generation;
      }
      setFileTree((prevTree) => {
        if (level === 0) {
          return nodes.map((node) => {
            const oldNode = prevTree.find((old) => old.path === node.path);
            return oldNode?.type === 'directory'
              ? { ...node, children: oldNode.children, loaded: oldNode.loaded }
              : node;
          });
        }
        // 更新目标节点,标记为已加载
        return updateTreeNode(prevTree, path, nodes, true);
      });

      return nodes;
    },
    [appId, chatId, fileRequests, outLinkAuthData]
  );
  const loadDirectoryRef = useLatest(loadDirectory);
  const onNewFilesRef = useLatest(onNewFiles);

  // 初始加载根目录的 loading 状态
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [fileStatus, setFileStatus] = useState<{ path: string; key: string }>();

  // 读取文件内容 - 根据 language 决定解码策略
  // - 媒体（image/audio/video）→ blob URL
  // - 其他 → 严格 UTF-8 解码；解不出来视为不可预览（如 xlsx/zip 等真二进制）
  const [pendingFileReads, setPendingFileReads] = useState<Record<string, number>>({});
  const fileReadSequence = useRef(0);
  const loadingFile = (pendingFileReads[activeFilePath] ?? 0) > 0;
  const loadFile = useCallback(
    async (
      filePath: string,
      language: string
    ): Promise<{
      content: string;
      isUnknown: boolean;
      hash?: string;
      workspaceGeneration: string;
    }> => {
      const readId = ++fileReadSequence.current;
      setPendingFileReads((pending) => ({ ...pending, [filePath]: readId }));
      try {
        return await fileRequests(
          async () => {
            const response = await getSandboxFile({
              appId,
              chatId,
              sandboxId: activeSandboxId.current,
              outLinkAuthData,
              path: filePath
            });

            const isBinary = getIsBinaryByLanguage(language);
            const hash = response.headers.get('X-Sandbox-Content-Hash') ?? undefined;
            const workspaceGeneration =
              response.headers.get('X-Sandbox-Workspace-Generation') ?? 'legacy';

            if (isBinary) {
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              blobUrls.current.add(url);
              return { content: url, isUnknown: false, hash, workspaceGeneration };
            }

            const buffer = await response.arrayBuffer();
            try {
              const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
              return { content, isUnknown: false, hash, workspaceGeneration };
            } catch {
              return { content: '', isUnknown: true, hash, workspaceGeneration };
            }
          },
          { mode: 'read' }
        );
      } finally {
        setPendingFileReads((pending) => {
          if (pending[filePath] !== readId) return pending;
          const next = { ...pending };
          delete next[filePath];
          return next;
        });
      }
    },
    [appId, chatId, fileRequests, outLinkAuthData]
  );
  const loadFileRef = useLatest(loadFile);
  const fileRefreshRequests = useRef(new Map<string, number>());

  const refreshOpenedFile = useCallback(
    async (file: OpenedFile, discardChanges = false) => {
      if (!loadFileRef.current) return;
      const requestId = (fileRefreshRequests.current.get(file.path) ?? 0) + 1;
      fileRefreshRequests.current.set(file.path, requestId);
      try {
        const { content, isUnknown, hash, workspaceGeneration } = await loadFileRef.current(
          file.path,
          file.language
        );
        const previous = openedFilesRef.current?.find((item) => item.path === file.path);
        if (!previous || fileRefreshRequests.current.get(file.path) !== requestId) {
          if (file.isBinary) revokeBlobUrl(content);
          return;
        }
        const changedWorkspace = previous.workspaceGeneration !== workspaceGeneration;
        if ((previous.isDirty || changedWorkspace) && !discardChanges) {
          if (file.isBinary) revokeBlobUrl(content);
          if (changedWorkspace || (previous.hash && previous.hash !== hash)) {
            setOpenedFiles((current) =>
              current.map((item) =>
                item.path === file.path ? { ...item, remoteChanged: true } : item
              )
            );
          }
          return;
        }
        if (previous.isBinary) revokeBlobUrl(previous.content);
        setOpenedFiles((current) =>
          current.map((item) =>
            item.path === file.path
              ? item.isDirty && !discardChanges
                ? { ...item, remoteChanged: item.hash !== hash }
                : {
                    ...item,
                    content,
                    isUnknown,
                    hash,
                    workspaceGeneration,
                    isDirty: false,
                    remoteChanged: false
                  }
              : item
          )
        );
        setFileStatus((current) => (current?.path === file.path ? undefined : current));
        stalePaths.current.delete(file.path);
      } catch (error) {
        if (fileRefreshRequests.current.get(file.path) !== requestId) return;
        if (isSandboxFileBusyError(error)) {
          setFileStatus({ path: file.path, key: 'chat:sandbox_busy' });
          return;
        }
        console.error('Failed to refresh sandbox file:', error);
      }
    },
    [loadFileRef, openedFilesRef, revokeBlobUrl]
  );

  // 保存文件
  const { run: saveFile, loading: saving } = useRequest(
    async (filePath?: string) => {
      const targetPath = filePath || activeFilePathRef.current;
      if (!targetPath) return;

      const targetFile = openedFilesRef.current?.find((f) => f.path === targetPath);
      if (!targetFile || targetFile.isBinary || targetFile.isUnknown) return;
      if (!targetFile.hash || !targetFile.workspaceGeneration) {
        setFileStatus({ path: targetPath, key: 'chat:sandbox_save_failed' });
        return;
      }
      if (targetFile.remoteChanged) {
        setFileStatus({ path: targetPath, key: 'chat:sandbox_file_changed' });
        return;
      }

      try {
        const result = await fileRequests(() =>
          writeSandboxFile({
            appId,
            chatId,
            sandboxId: activeSandboxId.current,
            outLinkAuthData,
            path: targetPath,
            content: targetFile.content,
            expectedHash: targetFile.hash,
            expectedWorkspaceGeneration: targetFile.workspaceGeneration
          })
        );

        setOpenedFiles((prev) =>
          prev.map((f) =>
            f.path === targetPath
              ? {
                  ...f,
                  hash: result.hash,
                  isDirty: f.content !== targetFile.content,
                  remoteChanged: false
                }
              : f
          )
        );
        setFileStatus((current) => (current?.path === targetPath ? undefined : current));
      } catch (error) {
        const message =
          error && typeof error === 'object' && 'message' in error ? error.message : '';
        const changed =
          message === 'sandbox_file_changed' || message === 'sandbox_workspace_changed';
        if (changed) {
          setOpenedFiles((prev) =>
            prev.map((f) => (f.path === targetPath ? { ...f, remoteChanged: true } : f))
          );
        }
        setFileStatus({
          path: targetPath,
          key: changed ? 'chat:sandbox_file_changed' : 'chat:sandbox_save_failed'
        });
      }
    },
    { manual: true, errorToast: '' }
  );

  // 下载工作区
  const { run: downloadWorkspace, loading: downloadingWorkspace } = useRequest(
    async () => {
      await fileRequests(
        () =>
          downloadSandbox({ appId, chatId, sandboxId: activeSandboxId.current, outLinkAuthData }),
        { mode: 'read', priority: 'background' }
      );
    },
    { manual: true }
  );

  // 下载当前文件
  const { run: downloadCurrentFile, loading: downloadingFile } = useRequest(
    async () => {
      if (!activeFile) return;

      // 通过服务端下载接口获取原始文件,支持二进制文件(图片等)
      await fileRequests(
        () =>
          downloadSandbox({
            appId,
            chatId,
            sandboxId: activeSandboxId.current,
            outLinkAuthData,
            path: activeFile.path
          }),
        { mode: 'read', priority: 'background' }
      );
    },
    { manual: true }
  );

  // 打开文件
  const openFile = async (filePath: string) => {
    const requestId = ++openingRequestId.current;
    if (compact) onRequestExpand?.();
    // 检查是否已打开
    const existingFile = openedFiles.find((f) => f.path === filePath);

    if (existingFile) {
      setOpeningFilePath(undefined);
      // 已打开,直接切换
      setActiveFilePath(filePath);
      setCompactView('file');
      if (stalePaths.current.has(filePath)) await refreshOpenedFile(existingFile);
      return;
    }

    // 新打开文件
    setOpeningFilePath(filePath);
    setCompactView('file');
    try {
      const fileName = filePath.split('/').pop() || '';
      const language = getLanguageByFileName(fileName);
      const isBinary = getIsBinaryByLanguage(language);

      const { content, isUnknown, hash, workspaceGeneration } = await loadFile(filePath, language);
      if (requestId !== openingRequestId.current) {
        if (isBinary) revokeBlobUrl(content);
        return;
      }

      const newFile: OpenedFile = {
        path: filePath,
        name: fileName,
        content,
        language,
        isBinary,
        isDirty: false,
        isUnknown,
        hash,
        workspaceGeneration
      };

      setOpenedFiles((prev) => [...prev, newFile]);
      setLoadError(undefined);
      setActiveFilePath(filePath);
    } catch (error) {
      if (requestId !== openingRequestId.current) return;
      if (isSandboxFileBusyError(error)) {
        setLoadError('chat:sandbox_busy');
        return;
      }
      console.error('Failed to open file:', error);
      toast({ title: t('chat:sandbox_file_open_failed'), status: 'error' });
    } finally {
      if (requestId === openingRequestId.current) setOpeningFilePath(undefined);
    }
  };

  // 关闭文件
  const closeFile = (filePath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    fileRefreshRequests.current.set(filePath, (fileRefreshRequests.current.get(filePath) ?? 0) + 1);
    setFileStatus((current) => (current?.path === filePath ? undefined : current));

    // 如果关闭的是当前文件,切换到其他文件
    setOpenedFiles((prev) => {
      const target = prev.find((f) => f.path === filePath);
      if (target?.isBinary) revokeBlobUrl(target.content);

      const newOpenedFiles = prev.filter((f) => f.path !== filePath);

      if (activeFilePath === filePath) {
        if (newOpenedFiles.length > 0) {
          setActiveFilePath(newOpenedFiles[newOpenedFiles.length - 1].path);
        } else {
          setActiveFilePath('');
        }
      }

      return newOpenedFiles;
    });
  };

  // 初始化加载根目录
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const baseline = hasLoaded.current ? previousPaths.current : undefined;
    const refreshedPaths = new Set<string>();
    const collectResponse = (nodes: TreeNode[]) => {
      for (const path of collectPaths(nodes)) refreshedPaths.add(path);
    };
    const currentLoadDirectory = loadDirectoryRef.current;
    if (!currentLoadDirectory) return;
    setLoadingRoot(true);
    currentLoadDirectory('.', 0, 'background', controller.signal)
      .then(async (rootNodes) => {
        if (cancelled) return;
        collectResponse(rootNodes);
        setLoadError(undefined);
        let activeFileRefresh: Promise<void> | undefined;
        if (hasLoaded.current) {
          const currentFiles = openedFilesRef.current ?? [];
          currentFiles.forEach((file) => stalePaths.current.add(file.path));
          const currentActive = currentFiles.find(
            (file) => file.path === activeFilePathRef.current
          );
          if (currentActive) activeFileRefresh = refreshOpenedFile(currentActive);
        }
        const refreshExpandedDirectories = async (nodes: TreeNode[]): Promise<void> => {
          await Promise.all(
            nodes.map(async (node) => {
              if (cancelled) return;
              if (node.type !== 'directory' || !expandedDirsRef.current?.has(node.path)) return;
              const children = await currentLoadDirectory(
                node.path,
                node.level + 1,
                'background',
                controller.signal
              );
              if (cancelled) return;
              collectResponse(children);
              await refreshExpandedDirectories(children);
            })
          );
        };
        await Promise.all([refreshExpandedDirectories(rootNodes), activeFileRefresh]);
        if (cancelled) return;
        hasLoaded.current = true;
        if (!cancelled && baseline && onNewFilesRef.current) {
          const added = [...refreshedPaths].filter((path) => !baseline.has(path)).length;
          if (added) onNewFilesRef.current(added);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (!isSandboxFileBusyError(error)) console.error('Failed to load sandbox files:', error);
        setLoadError(
          isSandboxFileBusyError(error) ? 'chat:sandbox_busy' : 'chat:sandbox_load_failed'
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingRoot(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    refreshVersion,
    retryVersion,
    loadDirectoryRef,
    onNewFilesRef,
    expandedDirsRef,
    openedFilesRef,
    activeFilePathRef,
    refreshOpenedFile
  ]);

  useEffect(() => {
    previousPaths.current = collectPaths(fileTree);
  }, [fileTree]);

  // 当切换 tab 时,更新编辑器内容
  useEffect(() => {
    const selectedFile = activeFileRef.current;
    if (!editorRef.current || !activeFilePath || !selectedFile) return;
    if (selectedFile.isBinary || selectedFile.isUnknown) return;

    // 使用 ref 标记防止循环更新
    isUpdatingRef.current = true;
    editorRef.current.setValue(selectedFile.content);

    // 延迟重置标记,确保 setValue 完成
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  }, [activeFilePath, activeFileRef]);

  // 切换目录展开/折叠
  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory' || loadingDirs.has(node.path)) return;

    const isExpanded = expandedDirs.has(node.path);

    if (isExpanded) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    } else {
      // 如果未加载过,则加载
      if (!node.loaded) {
        // 添加 loading 状态
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);

          return next;
        });

        // 使用 Promise 确保 finally 一定执行
        loadDirectory(node.path, node.level + 1)
          .then(() => {
            setLoadError(undefined);
            // 加载成功,展开目录
            setExpandedDirs((prev) => {
              const next = new Set(prev);
              next.add(node.path);
              return next;
            });
          })
          .catch((error) => {
            if (isSandboxFileBusyError(error)) {
              setLoadError('chat:sandbox_busy');
              return;
            }
            console.error('Failed to load directory:', error);
            toast({ title: t('chat:sandbox_load_failed'), status: 'error' });
          })
          .finally(() => {
            // 无论成功失败,都要移除 loading 状态
            setLoadingDirs((prev) => {
              const next = new Set(prev);
              next.delete(node.path);

              return next;
            });
          });
      } else {
        // 已加载,直接展开
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);
          return next;
        });
      }
    }
  };

  const filteredTree = filterTree(fileTree, searchQuery);

  const renderContent = () => {
    if (fileTree.length === 0) {
      if (loadingRoot) return null;

      return (
        <Center h="full" w={'full'}>
          <VStack spacing={3}>
            <EmptyTip text={t(loadError ?? 'chat:sandbox_no_file')} mt={0} />
            {loadError && (
              <Button
                size={'sm'}
                onClick={() => {
                  startAttempted.current = false;
                  setRetryVersion((value) => value + 1);
                }}
              >
                {t('chat:sandbox_refresh')}
              </Button>
            )}
          </VStack>
        </Center>
      );
    }

    return (
      <>
        {/* 左侧: 文件浏览器 */}
        <Box
          data-testid={'sandbox-file-tree'}
          display={!treeOnly && compact && compactView === 'file' ? 'none' : 'block'}
          h={'full'}
          w={compact || treeOnly ? 'full' : `${actualTreeWidth}px`}
          flexShrink={0}
        >
          <FileTree
            filteredTree={filteredTree}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            expandedDirs={expandedDirs}
            loadingDirs={loadingDirs}
            activeFilePath={activeFilePath}
            openingFilePath={openingFilePath}
            openFile={openFile}
            toggleDirectory={toggleDirectory}
            downloadingWorkspace={downloadingWorkspace}
            downloadWorkspace={downloadWorkspace}
            fullWidth={compact || treeOnly}
          />
        </Box>

        {!compact && !treeOnly && <ResizeDivider label={'调整目录宽度'} onMove={moveTree} />}

        {/* 右侧: 编辑器区域 */}
        <MyBox
          data-testid={'sandbox-file-preview'}
          isLoading={loadingFile && !openingFilePath}
          flex={1}
          w={0}
          minH={0}
          display={treeOnly || (compact && compactView === 'tree') ? 'none' : 'flex'}
          flexDirection="column"
          bg="myGray.25"
        >
          {compact && (
            <Box px={2} py={1} flexShrink={0} borderBottom={'1px solid'} borderColor={'myGray.200'}>
              <PaneActionButton
                action="back"
                label={String(t('chat:sandbox_back_to_files'))}
                onClick={() => setCompactView('tree')}
              />
            </Box>
          )}
          {openingFilePath ? (
            <Center data-testid="sandbox-file-opening" role="status" h="full" minW={0} px={4}>
              <VStack spacing={3} maxW="full">
                <Spinner size="sm" color="myGray.500" />
                <Text fontSize="sm" color="myGray.600" textAlign="center" noOfLines={1}>
                  {t('chat:sandbox_opening_file')} {openingFilePath.split('/').pop()}
                </Text>
              </VStack>
            </Center>
          ) : openedFiles.length > 0 ? (
            <>
              <FileTabs
                openedFiles={openedFiles}
                activeFilePath={activeFilePath}
                setActiveFilePath={(path) => {
                  void openFile(path);
                }}
                closeFile={closeFile}
              />
              <EditorContent
                activeFile={activeFile}
                activeFilePath={activeFilePath}
                saving={saving}
                downloadingFile={downloadingFile}
                downloadCurrentFile={downloadCurrentFile}
                saveFile={saveFile}
                fileStatus={fileStatus?.path === activeFilePath ? fileStatus.key : undefined}
                reloadFile={() => activeFile && void refreshOpenedFile(activeFile, true)}
                setOpenedFiles={setOpenedFiles}
                openedFiles={openedFiles}
                editorRef={editorRef}
                isUpdatingRef={isUpdatingRef}
                appId={appId}
                chatId={chatId}
                sandboxId={activeSandboxId.current}
                outLinkAuthData={outLinkAuthData}
              />
            </>
          ) : (
            filteredTree.length > 0 && (
              <Center h="full">
                <VStack spacing={3}>
                  <EmptyTip text={t('chat:sandbox_select_file_edit')} mt={0} />
                </VStack>
              </Center>
            )
          )}
        </MyBox>
      </>
    );
  };

  return (
    <Box ref={containerRef} h={'full'} w={'full'} minW={0}>
      <MyBox
        isLoading={loadingRoot && fileTree.length === 0}
        display={'flex'}
        position={'relative'}
        h="full"
        w="full"
        bg="myGray.25"
        borderRadius={panelMode ? 0 : '12px'}
        overflow="hidden"
        border={panelMode ? 0 : '1px solid'}
        borderColor="myGray.200"
      >
        {(waiting || (loadingRoot && fileTree.length > 0)) && (
          <Box
            position="absolute"
            top={2}
            right={2}
            zIndex={2}
            px={2}
            py={1}
            borderRadius="md"
            bg="blue.50"
            color="blue.700"
            fontSize="xs"
            role="status"
          >
            {t(waiting ? 'chat:sandbox_waiting' : 'chat:sandbox_refreshing')}
          </Box>
        )}
        {loadError && !waiting && !loadingRoot && fileTree.length > 0 && (
          <Button
            position={'absolute'}
            top={2}
            right={2}
            zIndex={2}
            size={'xs'}
            onClick={() => {
              startAttempted.current = false;
              setRetryVersion((value) => value + 1);
            }}
          >
            {t(loadError)}
          </Button>
        )}
        {renderContent()}
      </MyBox>
    </Box>
  );
};

export default SandboxEditor;
