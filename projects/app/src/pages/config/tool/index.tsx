'use client';

import { useMemo, useState } from 'react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import {
  Box,
  Button,
  Center,
  Flex,
  Grid,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  useDisclosure
} from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolRow from '@/pageComponents/config/tool/ToolRow';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import TagManageModal from '@/pageComponents/config/TagManageModal';
import dynamic from 'next/dynamic';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getAdminSystemTools, putAdminUpdateToolOrder } from '@/web/core/plugin/admin/tool/api';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/plugin/admin/tool/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

const SystemToolConfigModal = dynamic(
  () => import('@/pageComponents/config/tool/SystemToolConfigModal')
);
const WorkflowToolConfig = dynamic(
  () => import('@/pageComponents/config/tool/WorkflowToolConfigModal')
);
const ImportPluginModal = dynamic(() => import('@/pageComponents/config/ImportPluginModal'));

const ToolProvider = () => {
  const { t } = useSafeTranslation();

  const [localTools, setLocalTools] = useState<GetAdminSystemToolsResponseType>([]);
  const [editingToolId, setEditingToolId] = useState<string>();
  const [searchKey, setSearchKey] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const {
    isOpen: isOpenTagModal,
    onOpen: onOpenTagModal,
    onClose: onCloseTagModal
  } = useDisclosure();
  const {
    isOpen: isOpenImportModal,
    onOpen: onOpenImportModal,
    onClose: onCloseImportModal
  } = useDisclosure();

  const { runAsync: refreshTools, loading: loadingTools } = useRequest(
    () => getAdminSystemTools({ parentId: null }),
    {
      onSuccess: (data) => {
        if (data) {
          setLocalTools(data);
        }
      },
      manual: false
    }
  );

  const filteredTools = useMemo(() => {
    const normalizedSearchKey = searchKey.trim().toLocaleLowerCase();

    return localTools.filter((tool) => {
      const matchesSearch =
        !normalizedSearchKey ||
        tool.name.toLocaleLowerCase().includes(normalizedSearchKey) ||
        tool.intro?.toLocaleLowerCase().includes(normalizedSearchKey) ||
        tool.tags?.some((tag) => tag.toLocaleLowerCase().includes(normalizedSearchKey));
      const matchesStatus = statusFilter === 'all' || tool.status === Number(statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [localTools, searchKey, statusFilter]);

  const handleDragEnd = async (list: Array<AdminSystemToolListItemType>) => {
    const visibleIds = new Set(filteredTools.map((item) => item.id));
    const reorderedItems = [...list];
    const nextTools = localTools.map((item) =>
      visibleIds.has(item.id) ? reorderedItems.shift() ?? item : item
    );
    const newOrder = nextTools.map((item, index) => ({
      pluginId: item.id,
      pluginOrder: index
    }));

    setLocalTools(nextTools);
    await putAdminUpdateToolOrder({ plugins: newOrder });
  };

  return (
    <MyBox h={'100%'} p={0} isLoading={loadingTools} overflow={'hidden'}>
      <Flex
        minH={'68px'}
        px={6}
        py={3}
        alignItems={'center'}
        gap={4}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
        bg={'white'}
        flexWrap={{ base: 'wrap', lg: 'nowrap' }}
      >
        <Flex flex={1} minW={'220px'} alignItems={'center'} gap={3}>
          <Flex
            w={9}
            h={9}
            alignItems={'center'}
            justifyContent={'center'}
            bg={'myGray.900'}
            color={'white'}
            borderRadius={'md'}
          >
            <MyIcon name={'core/app/type/pluginFill'} w={'18px'} />
          </Flex>
          <Box minW={0}>
            <Flex alignItems={'center'} gap={2}>
              <Box color={'myGray.900'} fontWeight={800} fontSize={'lg'}>
                {t('common:navbar.plugin')}
              </Box>
              <Box
                px={2}
                py={0.5}
                borderRadius={'full'}
                bg={'primary.50'}
                color={'primary.700'}
                fontSize={'xs'}
                fontWeight={700}
              >
                {localTools.length}
              </Box>
            </Flex>
            <Box color={'myGray.500'} fontSize={'xs'} noOfLines={1}>
              {t('app:toolkit_registry_subtitle')}
            </Box>
          </Box>
        </Flex>

        <Flex alignItems={'center'} gap={2} flexWrap={'wrap'} justifyContent={'flex-end'}>
          <InputGroup w={{ base: '200px', xl: '250px' }}>
            <InputLeftElement pointerEvents={'none'}>
              <MyIcon name={'common/searchLight'} w={'15px'} color={'myGray.500'} />
            </InputLeftElement>
            <Input
              value={searchKey}
              onChange={(event) => setSearchKey(event.target.value)}
              bg={'white'}
              placeholder={t('common:Search')}
            />
          </InputGroup>
          <Select
            w={'130px'}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            bg={'white'}
          >
            <option value={'all'}>{t('common:All')}</option>
            <option value={PluginStatusEnum.Normal}>{t('app:toolkit_status_normal')}</option>
            <option value={PluginStatusEnum.SoonOffline}>
              {t('app:toolkit_status_soon_offline')}
            </option>
            <option value={PluginStatusEnum.Offline}>{t('app:toolkit_status_offline')}</option>
          </Select>
          <Button onClick={onOpenTagModal} variant={'whiteBase'}>
            {t('app:toolkit_tags_manage')}
          </Button>
          <MyMenu
            trigger="hover"
            Button={
              <Button leftIcon={<MyIcon name="common/addLight" w={'16px'} />}>
                {t('app:toolkit_add_resource')}
              </Button>
            }
            menuList={[
              {
                children: [
                  {
                    label: t('app:toolkit_import_resource'),
                    onClick: onOpenImportModal
                  },
                  {
                    label: t('app:toolkit_select_app'),
                    onClick: () => setEditingToolId('')
                  }
                ]
              }
            ]}
          />
        </Flex>
      </Flex>

      <Box h={'calc(100% - 68px)'} overflow={'auto'} bg={'white'}>
        <Box minW={'1080px'}>
          <Grid
            gridTemplateColumns={
              'minmax(300px, 2.4fr) minmax(130px, 1fr) 110px 120px 112px 140px 48px'
            }
            h={'44px'}
            px={4}
            alignItems={'center'}
            position={'sticky'}
            top={0}
            zIndex={2}
            bg={'myGray.50'}
            borderBottom={'1px solid'}
            borderColor={'myGray.200'}
            color={'myGray.600'}
            fontSize={'xs'}
            fontWeight={700}
          >
            <Box>{t('app:toolkit_name')}</Box>
            <Box>{t('app:toolkit_tags')}</Box>
            <Box>{t('app:toolkit_status')}</Box>
            <Box>{t('app:toolkit_default_install')}</Box>
            <Flex alignItems={'center'}>
              {t('app:toolkit_token_fee')}
              <QuestionTip ml={1} label={t('app:toolkit_token_fee_tip')} />
            </Flex>
            <Flex alignItems={'center'}>
              {t('app:toolkit_system_key')}
              <QuestionTip ml={1} label={t('app:toolkit_system_key_tip')} />
            </Flex>
            <Box textAlign={'center'}>{t('common:Action')}</Box>
          </Grid>

          {filteredTools.length > 0 ? (
            <DndDrag<AdminSystemToolListItemType>
              onDragEndCb={handleDragEnd}
              dataList={filteredTools}
            >
              {({ provided }) => (
                <Flex
                  flex={1}
                  flexDirection={'column'}
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {filteredTools.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <ToolRow
                          key={item.id}
                          tool={item}
                          setEditingToolId={setEditingToolId}
                          setLocalTools={setLocalTools}
                          provided={provided}
                          snapshot={snapshot}
                        />
                      )}
                    </Draggable>
                  ))}
                </Flex>
              )}
            </DndDrag>
          ) : (
            <Center minH={'320px'}>
              <EmptyTip text={t('app:toolkit_no_plugins')} py={2} />
            </Center>
          )}
        </Box>
      </Box>

      {isOpenTagModal && <TagManageModal onClose={onCloseTagModal} />}
      {isOpenImportModal && (
        <ImportPluginModal
          onClose={onCloseImportModal}
          onSuccess={refreshTools}
          tools={localTools}
        />
      )}
      {editingToolId !== undefined &&
        splitCombineToolId(editingToolId).source === AppToolSourceEnum.systemTool && (
          <SystemToolConfigModal
            toolId={editingToolId}
            onSuccess={refreshTools}
            onClose={() => setEditingToolId(undefined)}
          />
        )}
      {editingToolId !== undefined &&
        splitCombineToolId(editingToolId).source !== AppToolSourceEnum.systemTool && (
          <WorkflowToolConfig
            toolId={editingToolId}
            onSuccess={refreshTools}
            onClose={() => setEditingToolId(undefined)}
          />
        )}
    </MyBox>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'file']))
    }
  };
}

export default ToolProvider;
