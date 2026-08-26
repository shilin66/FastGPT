import { Box, Flex, IconButton, Switch } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { putAdminUpdateTool } from '@/web/core/plugin/admin/tool/api';
import React from 'react';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import type { AdminSystemToolListItemType } from '@fastgpt/global/core/plugin/admin/tool/type';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

const ToolRow = ({
  tool,
  setEditingToolId,
  setLocalTools,
  provided,
  snapshot
}: {
  tool: AdminSystemToolListItemType;
  setEditingToolId: (toolId: string) => void;
  setLocalTools: React.Dispatch<React.SetStateAction<GetAdminSystemToolsResponseType>>;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
}) => {
  const { t } = useTranslation();

  const { runAsync: updateSystemTool, loading } = useRequest(
    async (updateFields: {
      defaultInstalled?: boolean;
      hasTokenFee?: boolean;
      status?: PluginStatusEnum;
    }) => {
      return putAdminUpdateTool({
        ...tool,
        pluginId: tool.id,
        defaultInstalled: updateFields.defaultInstalled,
        hasTokenFee: updateFields.hasTokenFee,
        status: updateFields.status
      });
    },
    {
      onSuccess: (_, updateFields) => {
        setLocalTools((prev) =>
          prev.map((item) => (item.id === tool.id ? { ...item, ...updateFields[0] } : item))
        );
      },
      errorToast: t('app:toolkit_update_failed')
    }
  );

  return (
    <MyBox
      isLoading={loading}
      display={'grid'}
      gridTemplateColumns={'minmax(300px, 2.4fr) minmax(130px, 1fr) 110px 120px 112px 140px 48px'}
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
      cursor={'pointer'}
      bg={'white'}
      minH={'68px'}
      w={'full'}
      px={4}
      borderBottom={'1px solid'}
      borderColor={'myGray.150'}
      _hover={{
        bg: 'myGray.25'
      }}
      fontSize={'xs'}
      alignItems={'center'}
      onClick={() => {
        setEditingToolId(tool.id);
      }}
    >
      <Flex minW={0} alignItems={'center'} pr={5}>
        <Flex
          w={7}
          h={8}
          alignItems={'center'}
          justifyContent={'center'}
          borderRadius={'sm'}
          mr={2}
          onClick={(e) => {
            e.stopPropagation();
          }}
          _hover={{ bg: 'myGray.100' }}
          {...provided.dragHandleProps}
        >
          <MyIcon name="drag" w={'14px'} color={'myGray.500'} cursor={'grab'} />
        </Flex>
        <Avatar src={tool.avatar} borderRadius={'md'} w={'32px'} h={'32px'} flexShrink={0} />
        <Box pl={3} minW={0}>
          <Box
            color={'myGray.900'}
            fontSize={'sm'}
            fontWeight={700}
            whiteSpace={'nowrap'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
          >
            {tool.name}
          </Box>
          <Box
            mt={0.5}
            color={'myGray.500'}
            whiteSpace={'nowrap'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
          >
            {tool.intro || '-'}
          </Box>
        </Box>
      </Flex>
      <Box minW={0} pr={3}>
        {tool.tags && tool.tags.length > 0 ? (
          <Flex gap={1} overflow={'hidden'} whiteSpace={'nowrap'} alignItems={'center'}>
            {tool.tags.slice(0, 2).map((tag, index) => (
              <Box
                key={index}
                as={'span'}
                bg={'myGray.100'}
                px={1.5}
                py={0.5}
                color={'myGray.700'}
                borderRadius={'sm'}
                fontSize={'xs'}
                flexShrink={0}
              >
                {tag}
              </Box>
            ))}
            {tool.tags.length > 2 && (
              <Box color={'myGray.500'} flexShrink={0}>
                +{tool.tags.length - 2}
              </Box>
            )}
          </Flex>
        ) : (
          <Box as={'span'} color={'myGray.500'} fontSize={'xs'}>
            -
          </Box>
        )}
      </Box>
      <Flex alignItems={'center'} gap={2}>
        <Box
          w={2}
          h={2}
          borderRadius={'full'}
          bg={
            tool.status === PluginStatusEnum.Offline
              ? 'red.500'
              : tool.status === PluginStatusEnum.SoonOffline
                ? 'yellow.400'
                : 'green.500'
          }
          flexShrink={0}
        />
        <Box color={'myGray.700'} whiteSpace={'nowrap'}>
          {tool.status === PluginStatusEnum.Offline
            ? t('app:toolkit_status_offline')
            : tool.status === PluginStatusEnum.SoonOffline
              ? t('app:toolkit_status_soon_offline')
              : t('app:toolkit_status_normal')}
        </Box>
      </Flex>
      <Box onClick={(event) => event.stopPropagation()}>
        <Switch
          isChecked={tool.defaultInstalled}
          size={'sm'}
          onChange={(event) => {
            const newDefaultInstalled = event.target.checked;
            const updateFields: {
              defaultInstalled: boolean;
              status?: PluginStatusEnum;
            } = {
              defaultInstalled: newDefaultInstalled
            };
            if (newDefaultInstalled && tool.status !== PluginStatusEnum.Normal) {
              updateFields.status = PluginStatusEnum.Normal;
            }
            updateSystemTool(updateFields);
          }}
        />
      </Box>
      <Box onClick={(event) => event.stopPropagation()}>
        {tool.associatedPluginId ? (
          <Switch
            isChecked={tool.hasTokenFee}
            size={'sm'}
            onChange={(event) => updateSystemTool({ hasTokenFee: event.target.checked })}
          />
        ) : (
          <Box color={'myGray.400'}>-</Box>
        )}
      </Box>
      <Box>
        {tool.hasSecretInput ? (
          <Box color={tool.hasSystemSecret ? 'green.600' : 'myGray.500'} fontWeight={600}>
            {tool.hasSystemSecret
              ? t('app:toolkit_system_key_configured')
              : t('app:toolkit_system_key_not_configured')}
          </Box>
        ) : (
          <Box color={'myGray.400'}>-</Box>
        )}
      </Box>
      <IconButton
        aria-label={t('common:Edit')}
        size={'sm'}
        variant={'ghost'}
        color={'myGray.500'}
        icon={<MyIcon name={'common/arrowRight'} w={'14px'} />}
      />
    </MyBox>
  );
};

export default React.memo(ToolRow);
