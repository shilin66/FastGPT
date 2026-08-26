import React, { useMemo } from 'react';
import { Box, Flex, HStack, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext, TabEnum } from '../../context';
import {
  WorkflowBufferDataContext,
  WorkflowInitContext
} from '../../WorkflowComponents/context/workflowInitContext';
import WorkflowHeaderActions from './WorkflowHeaderActions';

type SaveOptions = {
  isPublish?: boolean;
  versionName?: string;
};

type Props = {
  isSaved: boolean;
  isV2Workflow: boolean;
  currentTab: TabEnum;
  showHistoryModal: boolean;
  isLoading: boolean;
  onBack: () => void;
  onRunTest: () => void;
  onOpenHistory: () => void;
  onClickSave: (options: SaveOptions) => Promise<void>;
  checkBeforePublish: () => boolean;
};

const steelBlue = '#2563EB';
const steelInk = '#1E293B';
const steelMuted = '#64748B';

const WorkflowHeaderBar = ({
  isSaved,
  isV2Workflow,
  currentTab,
  showHistoryModal,
  isLoading,
  onBack,
  onRunTest,
  onOpenHistory,
  onClickSave,
  checkBeforePublish
}: Props) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const { edges, nodeAmount } = useContextSelector(WorkflowBufferDataContext, (v) => v);

  const selectedNode = useMemo(() => nodes.find((node) => node.selected), [nodes]);
  const errorNodeAmount = useMemo(() => nodes.filter((node) => node.data?.isError).length, [nodes]);

  const isWorkflowEdit = currentTab === TabEnum.appEdit;
  const statusText = isSaved ? t('common:core.app.have_saved') : t('common:core.app.not_saved');

  return (
    <>
      <Flex
        h={['auto', '64px']}
        minH={['64px', '64px']}
        px={[3, 5]}
        py={[2, 0]}
        alignItems={'center'}
        gap={3}
        flexWrap={['wrap', 'nowrap']}
        position={'fixed'}
        top={0}
        left={0}
        right={0}
        zIndex={100}
        bg={'rgba(248, 250, 252, 0.92)'}
        borderBottom={'1px solid rgba(148, 163, 184, 0.18)'}
        boxShadow={'0 12px 34px rgba(15, 23, 42, 0.06)'}
        backdropFilter={'blur(14px)'}
        userSelect={'none'}
      >
        <IconButton
          icon={<MyIcon name={'common/leftArrowLight'} color={steelMuted} w={'14px'} />}
          aria-label={t('common:back')}
          size={'smSquare'}
          w={'34px'}
          h={'34px'}
          borderRadius={'10px'}
          bg={'white'}
          border={'1px solid rgba(148, 163, 184, 0.22)'}
          _hover={{ bg: 'rgba(37, 99, 235, 0.08)', color: steelBlue }}
          onClick={onBack}
        />

        <HStack minW={[0, '260px']} maxW={['100%', '340px']} spacing={3} overflow={'hidden'}>
          <Avatar src={appDetail.avatar} w={'36px'} borderRadius={'12px'} />
          <Box minW={0}>
            <HStack spacing={2} minW={0}>
              <Box
                color={steelInk}
                fontSize={'16px'}
                fontWeight={900}
                overflow={'hidden'}
                textOverflow={'ellipsis'}
                whiteSpace={'nowrap'}
              >
                {appDetail.name}
              </Box>
              {isV2Workflow && (
                <Box
                  flexShrink={0}
                  px={2}
                  py={'2px'}
                  borderRadius={'999px'}
                  color={isSaved ? '#166534' : '#92400E'}
                  bg={isSaved ? 'rgba(22, 163, 74, 0.1)' : 'rgba(200, 159, 69, 0.14)'}
                  fontSize={'11px'}
                  fontWeight={900}
                >
                  {statusText}
                </Box>
              )}
            </HStack>
            <Box
              mt={'2px'}
              color={steelMuted}
              fontSize={'12px'}
              fontWeight={600}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
              whiteSpace={'nowrap'}
            >
              {t('common:core.workflow.Debug')} / {t('app:publish_channel')} / {t('app:chat_logs')}
            </Box>
          </Box>
        </HStack>

        <HStack
          spacing={2}
          flexShrink={0}
          display={['none', 'flex']}
          px={2}
          py={'6px'}
          border={'1px solid rgba(148, 163, 184, 0.18)'}
          borderRadius={'14px'}
          bg={'white'}
        >
          <LocalStat label={t('workflow:header.nodes')} value={nodeAmount} />
          <LocalStat label={t('workflow:header.edges')} value={edges.length} />
          <LocalStat
            label={t('workflow:header.validation')}
            value={
              errorNodeAmount > 0
                ? t('workflow:header.validation_issues', { count: errorNodeAmount })
                : t('workflow:header.validation_passed')
            }
          />
        </HStack>

        <HStack
          display={['none', 'flex']}
          h={'34px'}
          minW={'160px'}
          maxW={'260px'}
          px={3}
          border={'1px solid rgba(37, 99, 235, 0.18)'}
          borderRadius={'999px'}
          bg={'white'}
          overflow={'hidden'}
          spacing={2}
        >
          <Box color={steelMuted} fontSize={'11px'} fontWeight={900} flexShrink={0}>
            {t('workflow:header.current_node')}
          </Box>
          <Box
            color={steelInk}
            fontSize={'12px'}
            fontWeight={800}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
          >
            {selectedNode?.data?.name || t('workflow:header.no_node_selected')}
          </Box>
        </HStack>

        <Box flex={1} minW={[0, 4]} />

        <WorkflowHeaderActions
          currentTab={currentTab}
          showHistoryModal={showHistoryModal}
          isWorkflowEdit={isWorkflowEdit}
          isLoading={isLoading}
          onRunTest={onRunTest}
          onOpenHistory={onOpenHistory}
          onClickSave={onClickSave}
          checkBeforePublish={checkBeforePublish}
        />
      </Flex>
    </>
  );
};

const LocalStat = ({ label, value }: { label: string; value: string | number }) => (
  <Box minW={'54px'} px={2}>
    <Box color={steelMuted} fontSize={'10px'} fontWeight={900} lineHeight={1}>
      {label}
    </Box>
    <Box mt={1} color={steelInk} fontSize={'15px'} fontWeight={900} lineHeight={1}>
      {value}
    </Box>
  </Box>
);

export default React.memo(WorkflowHeaderBar);
