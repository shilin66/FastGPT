import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Textarea
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useReactFlow } from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { WorkflowInitContext } from '../../context/workflowInitContext';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { useNodeConfiguration } from '../context/NodeConfigurationContext';

const palette = {
  blue: '#2563EB',
  ink: '#1F2937',
  graphite: '#27364A',
  muted: '#667085',
  border: '#DFE5EE',
  canvas: '#F8FAFC',
  danger: '#DC2626'
} as const;

const MIN_WIDTH = 420;
const MAX_WIDTH = 760;
const INITIAL_WIDTH = 520;

type SelectedNodeInspectorProps = {
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
};

const getDisplayText = (value: string | undefined, fallback: string) => value?.trim() || fallback;

const SelectedNodeInspector = ({ isOpen, onOpen, onClose }: SelectedNodeInspectorProps) => {
  const { t } = useTranslation();
  const { fitView } = useReactFlow();
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const selectedNode = useMemo(() => nodes.find((node) => node.selected), [nodes]);
  const selectedData = selectedNode?.data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { setActiveNodeId, setHost } = useNodeConfiguration();
  const [width, setWidth] = useState(INITIAL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftIntro, setDraftIntro] = useState('');
  const [dirtyFields, setDirtyFields] = useState({ name: false, intro: false });

  useEffect(() => {
    setDraftName(selectedData?.name ? t(selectedData.name as any) : '');
    setDraftIntro(selectedData?.intro ? t(selectedData.intro as any) : '');
    setDirtyFields({ name: false, intro: false });
  }, [selectedData?.intro, selectedData?.name, selectedData?.nodeId, t]);

  useEffect(() => {
    setActiveNodeId(isOpen ? selectedData?.nodeId : undefined);
  }, [isOpen, selectedData?.nodeId, setActiveNodeId]);

  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const updateWidth = (clientX: number) => {
      const availableWidth = window.innerWidth - clientX - 16;
      setWidth(Math.min(Math.max(availableWidth, MIN_WIDTH), MAX_WIDTH));
    };
    const onMouseMove = (event: MouseEvent) => updateWidth(event.clientX);
    const onTouchMove = (event: TouchEvent) => {
      const clientX = event.touches[0]?.clientX;
      if (clientX === undefined) return;
      event.preventDefault();
      updateWidth(clientX);
    };
    const stopResize = () => setIsResizing(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', stopResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', stopResize);
    };
  }, [isResizing]);

  const locateNode = useCallback(() => {
    if (!selectedNode) return;

    fitView({
      nodes: [{ id: selectedNode.id }],
      padding: 0.5,
      duration: 220
    });
  }, [fitView, selectedNode]);

  const commitBasicField = useCallback(
    (field: 'name' | 'intro') => {
      if (!selectedData || !dirtyFields[field]) return;

      const draftValue = field === 'name' ? draftName : draftIntro;
      const value = field === 'name' ? draftValue.trim() : draftValue.trimEnd();
      const currentDisplayValue = selectedData[field] ? t(selectedData[field] as any) : '';

      if (field === 'name' && !value) {
        setDraftName(currentDisplayValue);
        setDirtyFields((state) => ({ ...state, name: false }));
        return;
      }

      if (value !== currentDisplayValue) {
        onChangeNode({
          nodeId: selectedData.nodeId,
          type: 'attr',
          key: field,
          value
        });
      }
      setDirtyFields((state) => ({ ...state, [field]: false }));
    },
    [dirtyFields, draftIntro, draftName, onChangeNode, selectedData, t]
  );

  if (!isOpen) {
    return (
      <Box
        position={'absolute'}
        top={'82px'}
        right={4}
        zIndex={4}
        display={['none', 'none', 'block']}
      >
        <MyTooltip label={t('workflow:node_inspector.open')}>
          <IconButton
            aria-label={t('workflow:node_inspector.open')}
            icon={<MyIcon name={'common/settingLight'} w={'17px'} color={palette.blue} />}
            w={9}
            h={9}
            borderRadius={'8px'}
            bg={'white'}
            border={'1px solid'}
            borderColor={palette.border}
            boxShadow={'0 12px 28px rgba(15, 23, 42, 0.10)'}
            _hover={{ bg: '#EFF6FF', borderColor: '#BFDBFE' }}
            onClick={onOpen}
          />
        </MyTooltip>
      </Box>
    );
  }

  return (
    <Flex
      position={'absolute'}
      top={'80px'}
      right={4}
      bottom={4}
      zIndex={4}
      w={`${width}px`}
      maxW={'calc(100% - 32px)'}
      display={['none', 'none', 'flex']}
      flexDirection={'column'}
      overflow={'hidden'}
      border={'1px solid'}
      borderColor={palette.border}
      borderRadius={'8px'}
      bg={'white'}
      boxShadow={'0 24px 64px rgba(15, 23, 42, 0.16)'}
      className={'nodrag nowheel'}
    >
      <Box
        position={'absolute'}
        top={0}
        left={'-7px'}
        w={'14px'}
        h={'100%'}
        cursor={'col-resize'}
        zIndex={5}
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
        }}
        onTouchStart={() => setIsResizing(true)}
        _before={{
          content: '""',
          position: 'absolute',
          top: '50%',
          left: '5px',
          transform: 'translateY(-50%)',
          w: '4px',
          h: '52px',
          borderRadius: '4px',
          bg: isResizing ? palette.blue : '#CBD5E1',
          transition: 'background .16s ease'
        }}
        _hover={{ _before: { bg: palette.blue } }}
      />

      <Flex
        minH={'60px'}
        px={4}
        py={3}
        alignItems={'center'}
        borderBottom={'1px solid'}
        borderColor={palette.border}
        bg={palette.canvas}
      >
        <Box minW={0}>
          <Box color={palette.muted} fontSize={'10px'} fontWeight={900}>
            {t('workflow:node_inspector.eyebrow')}
          </Box>
          <Box mt={0.5} color={palette.graphite} fontSize={'16px'} fontWeight={900}>
            {t('workflow:node_inspector.configuration')}
          </Box>
        </Box>
        <Box flex={1} />
        <HStack spacing={2}>
          {selectedData && (
            <Button
              h={'32px'}
              px={3}
              borderRadius={'8px'}
              variant={'whiteBase'}
              leftIcon={<MyIcon name={'core/modules/fitView'} w={'14px'} />}
              onClick={locateNode}
            >
              {t('workflow:node_inspector.locate')}
            </Button>
          )}
          <MyTooltip label={t('workflow:node_inspector.close')}>
            <IconButton
              aria-label={t('workflow:node_inspector.close')}
              icon={<MyIcon name={'common/closeLight'} w={'16px'} color={palette.muted} />}
              h={'32px'}
              minW={'32px'}
              borderRadius={'8px'}
              variant={'whiteBase'}
              onClick={onClose}
            />
          </MyTooltip>
        </HStack>
      </Flex>

      {!selectedData ? (
        <Flex flex={1} alignItems={'center'} justifyContent={'center'} px={8} textAlign={'center'}>
          <Box maxW={'280px'}>
            <Flex
              mx={'auto'}
              mb={4}
              w={'44px'}
              h={'44px'}
              borderRadius={'8px'}
              alignItems={'center'}
              justifyContent={'center'}
              bg={'#EFF6FF'}
              border={'1px solid #BFDBFE'}
            >
              <MyIcon name={'common/settingLight'} w={'19px'} color={palette.blue} />
            </Flex>
            <Box color={palette.ink} fontSize={'15px'} fontWeight={900}>
              {t('workflow:node_inspector.empty_title')}
            </Box>
            <Box mt={2} color={palette.muted} fontSize={'13px'} lineHeight={1.7}>
              {t('workflow:node_inspector.empty_config_desc')}
            </Box>
          </Box>
        </Flex>
      ) : (
        <>
          <Flex px={4} py={3.5} alignItems={'center'} borderBottom={'1px solid #EEF2F6'}>
            <Avatar
              src={selectedData.avatarLinear || selectedData.avatar}
              w={'38px'}
              h={'38px'}
              borderRadius={'8px'}
            />
            <Box ml={3} minW={0} flex={1}>
              <Box
                color={palette.ink}
                fontSize={'15px'}
                fontWeight={900}
                className={'textEllipsis'}
              >
                {getDisplayText(draftName, t('workflow:node_inspector.unnamed_node'))}
              </Box>
              <Box mt={0.5} color={palette.muted} fontSize={'12px'} noOfLines={1}>
                {getDisplayText(draftIntro, selectedData.flowNodeType)}
              </Box>
            </Box>
            <Box
              ml={3}
              px={2.5}
              py={1}
              borderRadius={'6px'}
              bg={selectedData.isError ? '#FEF2F2' : '#ECFDF3'}
              color={selectedData.isError ? palette.danger : '#047857'}
              fontSize={'11px'}
              fontWeight={900}
            >
              {selectedData.isError
                ? t('workflow:node_inspector.status_error')
                : t('workflow:node_inspector.ready')}
            </Box>
          </Flex>

          <Box flex={1} h={0} overflowY={'auto'} bg={'white'} px={4} py={4}>
            <Box pb={5} borderBottom={'1px solid'} borderColor={palette.border}>
              <Flex mb={3} alignItems={'center'} justifyContent={'space-between'}>
                <Box color={palette.graphite} fontSize={'13px'} fontWeight={900}>
                  {t('workflow:node_inspector.basic_information')}
                </Box>
                <Box color={palette.muted} fontSize={'11px'} fontWeight={700}>
                  {t('workflow:node_inspector.auto_save')}
                </Box>
              </Flex>
              <FormControl isRequired>
                <FormLabel mb={1.5} color={palette.muted} fontSize={'11px'} fontWeight={800}>
                  {t('workflow:node_inspector.node_name')}
                </FormLabel>
                <Input
                  value={draftName}
                  maxLength={100}
                  h={'40px'}
                  borderRadius={'7px'}
                  borderColor={palette.border}
                  bg={palette.canvas}
                  fontSize={'13px'}
                  fontWeight={700}
                  placeholder={t('workflow:node_inspector.node_name_placeholder')}
                  _hover={{ borderColor: '#B9C6D8' }}
                  _focusVisible={{ borderColor: palette.blue, boxShadow: '0 0 0 1px #2563EB' }}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    setDirtyFields((state) => ({ ...state, name: true }));
                  }}
                  onBlur={() => commitBasicField('name')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </FormControl>
              <FormControl mt={3}>
                <FormLabel mb={1.5} color={palette.muted} fontSize={'11px'} fontWeight={800}>
                  {t('workflow:node_inspector.node_description')}
                </FormLabel>
                <Textarea
                  value={draftIntro}
                  maxLength={500}
                  minH={'88px'}
                  resize={'vertical'}
                  borderRadius={'7px'}
                  borderColor={palette.border}
                  bg={palette.canvas}
                  fontSize={'13px'}
                  lineHeight={1.6}
                  placeholder={t('workflow:node_inspector.node_description_placeholder')}
                  _hover={{ borderColor: '#B9C6D8' }}
                  _focusVisible={{ borderColor: palette.blue, boxShadow: '0 0 0 1px #2563EB' }}
                  onChange={(event) => {
                    setDraftIntro(event.target.value);
                    setDirtyFields((state) => ({ ...state, intro: true }));
                  }}
                  onBlur={() => commitBasicField('intro')}
                />
              </FormControl>
            </Box>

            <Flex mt={5} mb={3} alignItems={'center'} justifyContent={'space-between'}>
              <Box color={palette.graphite} fontSize={'13px'} fontWeight={900}>
                {t('workflow:node_inspector.parameter_settings')}
              </Box>
            </Flex>
            <Box
              ref={setHost}
              minH={'160px'}
              className={'oc-node-config-host'}
              sx={{
                '& .react-flow__handle': {
                  display: 'none !important'
                },
                '& > *': {
                  width: '100% !important',
                  maxWidth: 'none !important',
                  minWidth: '0 !important',
                  marginLeft: '0 !important',
                  marginRight: '0 !important'
                },
                '& > * + *': {
                  marginTop: '14px'
                }
              }}
            />
          </Box>
        </>
      )}
    </Flex>
  );
};

export default React.memo(SelectedNodeInspector);
