import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { SandboxWorkspaceItem } from '@fastgpt/global/openapi/core/ai/sandbox/management';
import { actOnSandboxWorkspace, listSandboxWorkspaces } from '@/web/core/ai/sandbox/management';

type Scope = { sourceType: 'appRuntime' | 'skillEdit'; sourceId: string };
type Action = 'release' | 'delete' | 'forceDelete';

const SandboxManagementModal = ({
  isOpen,
  onClose,
  scope
}: {
  isOpen: boolean;
  onClose: () => void;
  scope: Scope;
}) => {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<SandboxWorkspaceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState('');
  const [failed, setFailed] = useState<string[]>([]);
  const [incomplete, setIncomplete] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string>();
  const [emptyRecovery, setEmptyRecovery] = useState<{
    item: SandboxWorkspaceItem;
    revision: string;
  }>();
  const [recoveryError, setRecoveryError] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string>();
  const recoveryCancelRef = useRef<HTMLButtonElement>(null);
  const { openConfirm, ConfirmModal } = useConfirm();
  const requestSeq = useRef(0);
  const pageSize = 20;

  const refresh = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setLoadError(false);
    try {
      const result = await listSandboxWorkspaces({
        sourceId: scope.sourceId,
        sourceType: scope.sourceType,
        page,
        pageSize,
        search
      });
      if (requestId !== requestSeq.current) return;
      if (!result.list.length && page > 1) {
        setPage(Math.max(1, Math.ceil(result.total / pageSize)));
      }
      setItems(result.list);
      setTotal(result.total);
      setSupported(result.supported);
    } catch {
      if (requestId === requestSeq.current) setLoadError(true);
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, [scope.sourceId, scope.sourceType, page, search]);

  useEffect(() => {
    if (isOpen) void refresh();
    return () => {
      requestSeq.current += 1;
    };
  }, [isOpen, refresh]);
  useEffect(() => {
    setSelected([]);
    setFailed([]);
    setIncomplete([]);
    setProgress('');
    setDetailId(undefined);
  }, [scope.sourceId, scope.sourceType, page, search]);

  const eligible = useMemo(
    () => items.filter((item) => item.canRelease || item.canDelete),
    [items]
  );
  const selectedItems = items.filter((item) => selected.includes(item.sandboxId));
  const releaseCount = selectedItems.filter((item) => item.canRelease).length;
  const deleteCount = selectedItems.filter((item) => item.canDelete).length;
  const allSelected =
    eligible.length > 0 && eligible.every((item) => selected.includes(item.sandboxId));
  const detail = items.find((item) => item.sandboxId === detailId);
  const runtimeUserLabel = (item: SandboxWorkspaceItem) =>
    item.runtimeUserName || item.runtimeUserAccount || item.runtimeUserId;
  const recordStatusLabel = (item: SandboxWorkspaceItem) =>
    item.forceDeletionPending
      ? t('chat:sandbox_manage_force_pending')
      : item.releasedAt
        ? t('chat:sandbox_manage_released')
        : t(`chat:sandbox_manage_state_${item.status}`, { defaultValue: item.status });
  const providerStatusLabel = (item: SandboxWorkspaceItem) =>
    t(`chat:sandbox_manage_provider_${item.providerStatus}`);
  const sourceTypeLabel = (item: SandboxWorkspaceItem) =>
    t(`chat:sandbox_manage_source_${item.sourceType}`);
  const reuseScopeLabel = (item: SandboxWorkspaceItem) =>
    t(`chat:sandbox_manage_scope_${item.reuseScope ?? 'unknown'}`);
  const purposeLabel = (item: SandboxWorkspaceItem) =>
    t(`chat:sandbox_manage_purpose_${item.purpose ?? 'unknown'}`);

  const execute = async (action: Action, targets: SandboxWorkspaceItem[]) => {
    setPending(true);
    setFailed([]);
    const errors: string[] = [];
    const unfinished: string[] = [];
    setIncomplete([]);
    for (const [index, item] of targets.entries()) {
      setProgress(`${index + 1}/${targets.length}`);
      try {
        const result = await actOnSandboxWorkspace({
          ...scope,
          sandboxId: item.sandboxId,
          action,
          ...(action === 'forceDelete' ? { deletionRevision: item.deletionRevision } : {})
        });
        if (result.status === 'pending') {
          const reason = [
            'busy',
            'stale',
            'ownership_conflict',
            'unknown_operation',
            'cleanup_failed'
          ].includes(result.reason ?? '')
            ? result.reason
            : 'cleanup_failed';
          unfinished.push(`${item.sandboxId} (${t(`chat:sandbox_manage_force_reason_${reason}`)})`);
        } else if (!result.success) errors.push(item.sandboxId);
      } catch {
        errors.push(item.sandboxId);
      }
    }
    setFailed(errors);
    setIncomplete(unfinished);
    setProgress('');
    setPending(false);
    setSelected([]);
    await refresh();
  };

  const confirm = (action: Action, targets: SandboxWorkspaceItem[]) => {
    if (!targets.length) return;
    const message =
      action === 'forceDelete'
        ? t('chat:sandbox_manage_force_confirm', {
            name: targets[0].sourceName,
            sandboxId: targets[0].sandboxId
          })
        : action === 'release'
          ? t('chat:sandbox_manage_release_confirm', { count: targets.length })
          : t('chat:sandbox_manage_delete_confirm', { count: targets.length });
    openConfirm({
      customContent: String(message),
      onConfirm: () => execute(action, targets)
    })();
  };

  const recover = async (item: SandboxWorkspaceItem, revision?: string) => {
    if (pending) return;
    setPending(true);
    setRecoveryError(false);
    setRecoveringId(item.sandboxId);
    try {
      const result = await actOnSandboxWorkspace({
        ...scope,
        sandboxId: item.sandboxId,
        action: 'recover',
        ...(revision ? { rebuildEmpty: true, recoveryRevision: revision } : {})
      });
      if (result.status === 'confirmation_required' && result.recoveryRevision) {
        setEmptyRecovery({ item, revision: result.recoveryRevision });
      } else if (result.success) {
        setEmptyRecovery(undefined);
        await refresh();
      } else setRecoveryError(true);
    } catch {
      setRecoveryError(true);
    } finally {
      setPending(false);
      setRecoveringId(undefined);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={pending ? () => {} : onClose} size={'xl'} isCentered>
        <ModalOverlay />
        <ModalContent
          w={'calc(100vw - 48px)'}
          maxW={'1120px'}
          h={detail ? '460px' : `${Math.min(700, Math.max(340, 258 + items.length * 86))}px`}
          maxH={'calc(100vh - 64px)'}
        >
          <ModalHeader fontSize={'18px'}>{t('chat:sandbox_manage_title')}</ModalHeader>
          <ModalCloseButton isDisabled={pending} />
          <ModalBody display={'flex'} flexDirection={'column'} minH={0} px={6}>
            {detail && (
              <Box overflowY={'auto'} flex={1} minH={0}>
                <Button
                  size={'sm'}
                  variant={'whitePrimary'}
                  mb={4}
                  onClick={() => setDetailId(undefined)}
                >
                  {t('chat:sandbox_manage_back')}
                </Button>
                <Text fontWeight={600} fontSize={'16px'} mb={3}>
                  {detail.sourceName}
                </Text>
                {(
                  [
                    ['sourceType', sourceTypeLabel(detail)],
                    ['reuseScope', reuseScopeLabel(detail)],
                    ['purpose', purposeLabel(detail)],
                    ['runtimeUserName', detail.runtimeUserName],
                    [
                      'runtimeUserAccount',
                      detail.runtimeUserId
                        ? detail.runtimeUserAccount ||
                          t('chat:sandbox_manage_user_account_unavailable')
                        : undefined
                    ],
                    ['runtimeUserId', detail.runtimeUserId],
                    ['technicalName', detail.technicalName],
                    ['sandboxId', detail.sandboxId],
                    ['sourceId', detail.sourceId],
                    ['sourceChatId', detail.sourceChatId],
                    ['sessionId', detail.sessionId],
                    ['providerSandboxId', detail.providerSandboxId],
                    ['storageClaimName', detail.storageClaimName],
                    ['providerStatus', providerStatusLabel(detail)],
                    ['status', recordStatusLabel(detail)],
                    [
                      'operation',
                      detail.operation
                        ? `${detail.operation.type} · ${detail.operation.checkpoint}`
                        : undefined
                    ],
                    ['createdAt', new Date(detail.createdAt).toLocaleString(i18n.language)],
                    ['lastActiveAt', new Date(detail.lastActiveAt).toLocaleString(i18n.language)]
                  ] as const
                )
                  .filter(([, value]) => !!value)
                  .map(([key, value]) => (
                    <Flex
                      key={key}
                      py={2}
                      borderBottom={'1px solid'}
                      borderColor={'myGray.100'}
                      gap={4}
                      fontSize={'12px'}
                    >
                      <Text w={'170px'} flexShrink={0} color={'myGray.500'}>
                        {t(`chat:sandbox_manage_field_${key}`)}
                      </Text>
                      <Text wordBreak={'break-all'}>{value}</Text>
                    </Flex>
                  ))}
              </Box>
            )}
            {!detail && (
              <>
                <Flex gap={3} mb={4} align={'center'}>
                  <Input
                    maxW={'360px'}
                    value={searchText}
                    placeholder={String(t('chat:sandbox_manage_search'))}
                    onChange={(event) => setSearchText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setPage(1);
                        setSearch(searchText.trim());
                      }
                    }}
                  />
                  <Button
                    variant={'whitePrimary'}
                    onClick={() => {
                      setPage(1);
                      setSearch(searchText.trim());
                    }}
                  >
                    {t('common:Search')}
                  </Button>
                  <Button
                    ml={'auto'}
                    variant={'whitePrimary'}
                    onClick={() => void refresh()}
                    isLoading={loading}
                  >
                    {t('chat:sandbox_refresh')}
                  </Button>
                </Flex>
                {loadError && (
                  <Text color={'red.500'} mb={3} role={'alert'}>
                    {t('chat:sandbox_manage_load_failed')}
                  </Text>
                )}
                {recoveryError && (
                  <Text color={'red.500'} mb={3} role={'alert'}>
                    {t('chat:sandbox_manage_recovery_failed')}
                  </Text>
                )}
                {!supported ? (
                  <Text color={'myGray.600'}>{t('chat:sandbox_manage_docker_only')}</Text>
                ) : (
                  <Box
                    overflowY={'auto'}
                    flex={1}
                    minH={0}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    borderRadius={'md'}
                  >
                    <Flex
                      px={4}
                      py={3}
                      bg={'myGray.50'}
                      borderBottom={'1px solid'}
                      borderColor={'myGray.200'}
                      align={'center'}
                      gap={4}
                    >
                      <Checkbox
                        aria-label={String(t('chat:sandbox_manage_select_page'))}
                        isChecked={allSelected}
                        isDisabled={pending || !eligible.length}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked ? eligible.map((item) => item.sandboxId) : []
                          )
                        }
                      />
                      <Text fontSize={'12px'} color={'myGray.600'}>
                        {t('chat:sandbox_manage_count', { count: total })}
                      </Text>
                    </Flex>
                    {loading && items.length === 0 && (
                      <Flex justify={'center'} py={12}>
                        <Spinner />
                      </Flex>
                    )}
                    {!loading && items.length === 0 && !loadError && (
                      <Text textAlign={'center'} color={'myGray.500'} py={12}>
                        {t('chat:sandbox_manage_empty')}
                      </Text>
                    )}
                    {items.map((item) => (
                      <Flex
                        key={item.sandboxId}
                        px={4}
                        py={3}
                        borderBottom={'1px solid'}
                        borderColor={'myGray.100'}
                        align={'center'}
                        gap={4}
                        minW={0}
                      >
                        <Checkbox
                          aria-label={`${t('chat:sandbox_manage_select')} ${item.technicalName}`}
                          isChecked={selected.includes(item.sandboxId)}
                          isDisabled={pending || (!item.canRelease && !item.canDelete)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, item.sandboxId]
                                : current.filter((id) => id !== item.sandboxId)
                            )
                          }
                        />
                        <Box flex={1} minW={0}>
                          <Text fontSize={'13px'} fontWeight={600} noOfLines={1}>
                            {item.sourceName}
                          </Text>
                          {runtimeUserLabel(item) && (
                            <Text
                              fontSize={'12px'}
                              color={'myGray.600'}
                              noOfLines={1}
                              title={runtimeUserLabel(item)}
                            >
                              {t('chat:sandbox_manage_user')}：{runtimeUserLabel(item)}
                            </Text>
                          )}
                          <Flex gap={3} flexWrap={'wrap'} fontSize={'12px'} color={'myGray.600'}>
                            <Text>
                              {t('chat:sandbox_manage_field_sourceType')}：{sourceTypeLabel(item)}
                            </Text>
                            <Text>
                              {t('chat:sandbox_manage_field_reuseScope')}：{reuseScopeLabel(item)}
                            </Text>
                            <Text>
                              {t('chat:sandbox_manage_field_purpose')}：{purposeLabel(item)}
                            </Text>
                          </Flex>
                          <Text
                            fontSize={'11px'}
                            color={'myGray.500'}
                            noOfLines={1}
                            title={item.sandboxId}
                          >
                            {item.sourceChatId
                              ? `${t('chat:sandbox_manage_chat')} ${item.sourceChatId} · `
                              : ''}
                            {item.sandboxId}
                          </Text>
                        </Box>
                        <Box w={'120px'} flexShrink={0}>
                          <Badge
                            colorScheme={
                              item.providerStatus === 'running'
                                ? 'green'
                                : item.providerStatus === 'error'
                                  ? 'red'
                                  : item.providerStatus === 'unknown' || item.statusMismatch
                                    ? 'orange'
                                    : 'gray'
                            }
                          >
                            {providerStatusLabel(item)}
                          </Badge>
                          {item.forceDeletionPending && (
                            <Text fontSize={'11px'} color={'orange.600'} mt={1}>
                              {t('chat:sandbox_manage_force_pending')}
                            </Text>
                          )}
                          {(item.statusMismatch || item.providerStatus === 'unknown') && (
                            <Text
                              fontSize={'11px'}
                              color={item.statusMismatch ? 'orange.600' : 'myGray.500'}
                              mt={1}
                              noOfLines={2}
                              title={String(recordStatusLabel(item))}
                            >
                              {item.statusMismatch && (
                                <>{t('chat:sandbox_manage_status_mismatch')} · </>
                              )}
                              {t('chat:sandbox_manage_record_status', {
                                status: recordStatusLabel(item)
                              })}
                            </Text>
                          )}
                          <Text fontSize={'11px'} color={'myGray.500'} mt={1}>
                            {item.hasPersistentStorage
                              ? t('chat:sandbox_manage_files_retained')
                              : t('chat:sandbox_manage_no_volume')}
                          </Text>
                        </Box>
                        <Text w={'140px'} flexShrink={0} fontSize={'11px'} color={'myGray.500'}>
                          {new Date(item.lastActiveAt).toLocaleString(i18n.language)}
                        </Text>
                        <Flex
                          w={'310px'}
                          flexShrink={0}
                          justify={'flex-end'}
                          gap={2}
                          flexWrap={'wrap'}
                        >
                          <Button
                            size={'xs'}
                            variant={'whitePrimary'}
                            onClick={() => setDetailId(item.sandboxId)}
                          >
                            {t('chat:sandbox_manage_detail')}
                          </Button>
                          {scope.sourceType === 'appRuntime' && (
                            <Button
                              size={'xs'}
                              variant={'whitePrimary'}
                              isDisabled={!item.canRecover || pending}
                              isLoading={recoveringId === item.sandboxId}
                              onClick={() => void recover(item)}
                            >
                              {t('chat:sandbox_manage_recover')}
                            </Button>
                          )}
                          <Button
                            size={'xs'}
                            variant={'whitePrimary'}
                            isDisabled={!item.canRelease || pending}
                            onClick={() => confirm('release', [item])}
                          >
                            {t('chat:sandbox_manage_release')}
                          </Button>
                          <Button
                            size={'xs'}
                            colorScheme={'red'}
                            variant={'outline'}
                            isDisabled={(!item.canDelete && !item.canForceDelete) || pending}
                            onClick={() =>
                              confirm(item.canForceDelete ? 'forceDelete' : 'delete', [item])
                            }
                          >
                            {item.canForceDelete
                              ? t(
                                  item.forceDeletionPending
                                    ? 'chat:sandbox_manage_force_continue'
                                    : 'chat:sandbox_manage_force_delete'
                                )
                              : t('chat:sandbox_manage_delete')}
                          </Button>
                        </Flex>
                      </Flex>
                    ))}
                  </Box>
                )}
                {incomplete.length > 0 && (
                  <Text color={'orange.600'} mt={3} role={'alert'}>
                    {t('chat:sandbox_manage_force_pending_hint')}: {incomplete.join(', ')}
                  </Text>
                )}
                {failed.length > 0 && (
                  <Text color={'red.500'} mt={3} role={'alert'}>
                    {t('chat:sandbox_manage_failed', { count: failed.length })}: {failed.join(', ')}
                  </Text>
                )}
              </>
            )}
          </ModalBody>
          {!detail && (
            <ModalFooter gap={2}>
              {progress && (
                <Text fontSize={'12px'} color={'myGray.500'} mr={'auto'}>
                  {t('chat:sandbox_manage_processing')} {progress}
                </Text>
              )}
              <Button
                variant={'whitePrimary'}
                isDisabled={page <= 1 || pending}
                onClick={() => setPage(page - 1)}
              >
                {t('chat:sandbox_manage_previous')}
              </Button>
              <Text fontSize={'12px'}>{page}</Text>
              <Button
                variant={'whitePrimary'}
                isDisabled={page * pageSize >= total || pending}
                onClick={() => setPage(page + 1)}
              >
                {t('chat:sandbox_manage_next')}
              </Button>
              <Button
                colorScheme={'blue'}
                isDisabled={releaseCount === 0 || pending}
                onClick={() =>
                  confirm(
                    'release',
                    selectedItems.filter((item) => item.canRelease)
                  )
                }
              >
                {t('chat:sandbox_manage_release_selected', { count: releaseCount })}
              </Button>
              <Button
                colorScheme={'red'}
                variant={'outline'}
                isDisabled={deleteCount === 0 || pending}
                onClick={() =>
                  confirm(
                    'delete',
                    selectedItems.filter((item) => item.canDelete)
                  )
                }
              >
                {t('chat:sandbox_manage_delete_selected', { count: deleteCount })}
              </Button>
            </ModalFooter>
          )}
        </ModalContent>
      </Modal>
      <ConfirmModal isLoading={pending} />
      <Modal
        isOpen={!!emptyRecovery}
        onClose={() => !pending && setEmptyRecovery(undefined)}
        isCentered
        initialFocusRef={recoveryCancelRef}
      >
        <ModalOverlay />
        <ModalContent maxW={'460px'}>
          <ModalHeader>{t('chat:sandbox_manage_empty_rebuild_title')}</ModalHeader>
          <ModalCloseButton isDisabled={pending} />
          <ModalBody whiteSpace={'pre-wrap'} fontSize={'sm'}>
            {t('chat:sandbox_manage_empty_rebuild_confirm', {
              name: emptyRecovery?.item.sourceName,
              sandboxId: emptyRecovery?.item.sandboxId
            })}
            {recoveryError && (
              <Text role={'alert'} color={'red.500'} mt={3}>
                {t('chat:sandbox_manage_recovery_failed')}
              </Text>
            )}
          </ModalBody>
          <ModalFooter gap={3}>
            <Button
              ref={recoveryCancelRef}
              variant={'whitePrimary'}
              isDisabled={pending}
              onClick={() => setEmptyRecovery(undefined)}
            >
              {t('chat:sandbox_manage_recovery_cancel')}
            </Button>
            <Button
              variant={'dangerFill'}
              isLoading={pending}
              onClick={() =>
                emptyRecovery && void recover(emptyRecovery.item, emptyRecovery.revision)
              }
            >
              {t('chat:sandbox_manage_empty_rebuild')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default SandboxManagementModal;
