import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Flex, Text } from '@chakra-ui/react';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import dynamic from 'next/dynamic';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { SkillWorkspaceFileResponse } from '@fastgpt/global/openapi/core/agentSkills/files';
import { postSkillWorkspaceFiles } from '@/web/core/skill/api';
import { SkillDetailContext } from '../context';
import { useTranslation } from 'next-i18next';
import { diffWorkspaceFiles, type WorkspaceFileChange } from './fileChanges';
import WorkspaceFileTree from './WorkspaceFileTree';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { workspaceLayout } from '../workspaceLayout';

const CodeEditor = dynamic(
  () => import('@fastgpt/web/components/common/Textarea/CodeEditor/Editor'),
  { ssr: false }
);
type FileContent = Extract<SkillWorkspaceFileResponse, { action: 'read' }>;
type Entry = Extract<SkillWorkspaceFileResponse, { action: 'list' }>['files'][number];

const WorkspaceFiles = () => {
  const { t } = useTranslation();
  const { skillId, chatRunning, registerWorkspaceSave, sandboxState, skillDetail } =
    useContextSelector(SkillDetailContext, (v) => v);
  const workspace = skillDetail?.workspace;
  const readable =
    sandboxState === 'ready' &&
    (workspace?.status === 'running' ||
      (workspace?.status === 'provisioning' && workspace.operation?.type === 'debug'));
  const writable = readable && workspace?.status === 'running' && !chatRunning;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [file, setFile] = useState<FileContent>();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<WorkspaceFileChange[]>([]);
  const previousEntries = useRef<Entry[]>();
  const mounted = useRef(true);
  const readRequest = useRef(0);
  const listRequest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readRequest.current++;
      listRequest.current++;
    };
  }, []);
  const current = useRef({ file, draft, conflict });
  current.current = { file, draft, conflict };
  const pending = useRef<Promise<void>>();
  const dirty = !!file && file.content !== draft;

  const save = useMemoizedFn(async (): Promise<void> => {
    if (!mounted.current) return;
    if (pending.current) {
      await pending.current;
      return save();
    }
    const state = current.current;
    if (state.conflict) throw new Error(t('skill:file_conflict_error'));
    if (!state.file || state.file.content === state.draft) return;
    if (!writable) throw new Error(t('skill:workspace_not_ready'));
    setSaving(true);
    pending.current = (async () => {
      const response = await postSkillWorkspaceFiles({
        skillId,
        action: 'write',
        path: state.file!.path,
        content: state.draft,
        expectedHash: state.file!.hash
      });
      if (response.action !== 'write') throw new Error('Unexpected file save response');
      if (!mounted.current) return;
      if (current.current.file?.path === response.path) {
        const next = {
          ...state.file!,
          hash: response.hash,
          version: response.version,
          content: state.draft
        };
        current.current.file = next;
        setFile(next);
      }
      setError('');
    })()
      .catch((error: unknown) => {
        const message = getErrText(error);
        setError(message);
        if (message.includes('conflict')) {
          current.current.conflict = true;
          setConflict(true);
        }
        throw error;
      })
      .finally(() => {
        pending.current = undefined;
        setSaving(false);
      });
    await pending.current;
    if (current.current.file?.content !== current.current.draft) await save();
  });

  const open = useMemoizedFn(async (path: string, discard = false) => {
    const request = ++readRequest.current;
    if (!discard) await save();
    const response = await postSkillWorkspaceFiles({ skillId, action: 'read', path });
    if (response.action !== 'read' || !mounted.current || request !== readRequest.current) return;
    current.current = { file: response, draft: response.content, conflict: false };
    setFile(response);
    setDraft(response.content);
    setConflict(false);
    setError('');
  });

  const refresh = useMemoizedFn(async () => {
    const request = ++listRequest.current;
    const response = await postSkillWorkspaceFiles({ skillId, action: 'list' });
    if (response.action !== 'list' || !mounted.current || request !== listRequest.current) return;
    if (previousEntries.current && !response.truncated) {
      const latest = diffWorkspaceFiles(previousEntries.current, response.files);
      if (latest.length) setChanges((current) => [...latest, ...current].slice(0, 8));
    }
    previousEntries.current = response.truncated ? undefined : response.files;
    setListError('');
    setTruncated(response.truncated);
    setEntries(response.files);
    const state = current.current;
    if (!state.file || pending.current) return;
    const remote = response.files.find((entry) => entry.path === state.file!.path);
    if (remote?.version === state.file.version) return;
    if (state.file.content !== state.draft) {
      current.current.conflict = true;
      setConflict(true);
      return;
    }
    if (!remote) {
      current.current = { file: undefined, draft: '', conflict: false };
      setFile(undefined);
      setDraft('');
      return;
    }
    const refreshed = await postSkillWorkspaceFiles({
      skillId,
      action: 'read',
      path: state.file.path
    });
    if (
      mounted.current &&
      request === listRequest.current &&
      refreshed.action === 'read' &&
      current.current.file === state.file &&
      current.current.draft === state.draft
    ) {
      current.current = { file: refreshed, draft: refreshed.content, conflict: false };
      setFile(refreshed);
      setDraft(refreshed.content);
      setConflict(false);
    }
  });

  useEffect(() => {
    registerWorkspaceSave(save);
    return () => registerWorkspaceSave();
  }, [registerWorkspaceSave, save]);
  useEffect(() => {
    if (!readable) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh();
      } catch (error) {
        if (active) setListError(getErrText(error));
      }
      if (active) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh, skillId, readable]);
  useEffect(() => {
    if (!dirty || conflict || !writable || error) return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, draft, conflict, writable, error, save]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (current.current.file?.content !== current.current.draft && current.current.file) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  return (
    <Flex h="100%" minH={0} direction="column">
      {(error || listError) && (
        <Alert status="error" fontSize="sm">
          {error || listError}
        </Alert>
      )}
      {truncated && (
        <Alert status="warning" fontSize="sm">
          {t('skill:file_list_truncated')}
        </Alert>
      )}
      {!!changes.length && (
        <Box
          px={3}
          py={1}
          maxH="72px"
          overflowY="auto"
          fontSize="xs"
          color="myGray.500"
          aria-live="polite"
        >
          {changes.map((change, index) => (
            <Text key={`${change.path}:${change.version}:${index}`} title={change.version}>
              {change.type === 'created' ? '+' : change.type === 'deleted' ? '−' : '~'}{' '}
              {change.path}
            </Text>
          ))}
        </Box>
      )}
      {conflict && (
        <Alert status="warning" fontSize="sm" gap={2}>
          {t('skill:file_conflict_hint')}
          <Button
            size="xs"
            flexShrink={0}
            onClick={() => file && void open(file.path, true).catch((e) => setError(getErrText(e)))}
          >
            {t('skill:file_conflict_resolve')}
          </Button>
        </Alert>
      )}
      <Flex flex={1} minH={0}>
        <WorkspaceFileTree
          entries={entries}
          selectedPath={file?.path}
          onOpen={(path) => void open(path).catch((e) => setError(getErrText(e)))}
        />
        <Flex flex={1} minW={0} direction="column">
          <Flex
            px={3}
            h={workspaceLayout.toolbarHeight}
            gap={2}
            align="center"
            flexShrink={0}
            borderBottomWidth="1px"
            borderColor="myGray.200"
            bg="myGray.25"
          >
            <MyIcon
              name="core/app/sandbox/file"
              w="16px"
              color="primary.500"
              flexShrink={0}
              aria-hidden
            />
            <Text flex={1} minW={0} fontSize="xs" color="myGray.600" isTruncated title={file?.path}>
              {file?.path || t('skill:file_select_title')}
            </Text>
            <Text
              fontSize="xs"
              whiteSpace="nowrap"
              flexShrink={0}
              color={conflict ? 'orange.600' : dirty || saving ? 'myGray.500' : 'green.600'}
              role="status"
            >
              {t(
                saving
                  ? 'skill:file_sync_saving'
                  : conflict
                    ? 'skill:file_sync_conflict'
                    : dirty
                      ? 'skill:file_sync_dirty'
                      : 'skill:file_sync_saved'
              )}
            </Text>
            <Button
              size="xs"
              variant="whiteBase"
              flexShrink={0}
              onClick={() => void refresh().catch((e) => setListError(getErrText(e)))}
            >
              {t('skill:file_refresh')}
            </Button>
            <Button
              size="xs"
              flexShrink={0}
              isDisabled={!dirty || conflict || !writable}
              isLoading={saving}
              onClick={() => void save().catch(() => {})}
            >
              {t('skill:file_save')}
            </Button>
          </Flex>
          {file ? (
            <CodeEditor
              key={file.path}
              flex={1}
              h="100%"
              minH={0}
              borderWidth={0}
              borderRadius={0}
              value={draft}
              onChange={(value) => {
                current.current.draft = value;
                setDraft(value);
              }}
              language={
                file.path.endsWith('.py')
                  ? 'python'
                  : file.path.endsWith('.md')
                    ? 'markdown'
                    : file.path.endsWith('.json')
                      ? 'json'
                      : file.path.endsWith('.sh')
                        ? 'shell'
                        : 'plaintext'
              }
              options={{
                readOnly: !writable,
                wordWrap: 'on',
                fontSize: 13,
                lineHeight: 22,
                padding: { top: 16, bottom: 16 },
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false
              }}
            />
          ) : (
            <Flex
              flex={1}
              direction="column"
              gap={3}
              px={6}
              align="center"
              justify="center"
              color="myGray.500"
              fontSize="sm"
              textAlign="center"
            >
              <Flex
                align="center"
                justify="center"
                w="52px"
                h="52px"
                bg="myGray.50"
                borderRadius="xl"
              >
                <MyIcon name="code" w="24px" color="myGray.400" aria-hidden />
              </Flex>
              <Text color="myGray.700" fontWeight="medium">
                {t('skill:file_select_title')}
              </Text>
              <Text maxW="280px" fontSize="xs" lineHeight="1.8">
                {t('skill:file_select_hint')}
              </Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
};
export default WorkspaceFiles;
