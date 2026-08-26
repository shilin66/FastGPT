import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { updateLogKeys } from '@/web/core/app/api/log';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import type {
  getLogKeysResponseType,
  updateLogKeysBody
} from '@fastgpt/global/openapi/core/app/log/api';
import type { SetState } from 'ahooks/lib/createUseStorageState';

const SyncLogKeysPopover = ({
  logKeys,
  setLogKeys,
  teamLogKeys,
  fetchLogKeys,
  appId
}: {
  logKeys: AppLogKeysType[];
  setLogKeys: (value: SetState<AppLogKeysType[]>) => void;
  teamLogKeys: AppLogKeysType[];
  fetchLogKeys: () => Promise<getLogKeysResponseType>;
  appId: string;
}) => {
  const { t } = useTranslation();

  const { runAsync: updateList, loading: updateLoading } = useRequest(
    async (data: updateLogKeysBody) => {
      await updateLogKeys(data);
    },
    {
      manual: true,
      onSuccess: async () => {
        await fetchLogKeys();
      }
    }
  );

  return (
    <MyPopover
      placement="bottom-end"
      w={'360px'}
      closeOnBlur={true}
      trigger="click"
      Trigger={
        <Flex alignItems={'center'} cursor={'pointer'}>
          <MyIcon name="common/warn" w={4} color={'yellow.500'} />
        </Flex>
      }
    >
      {({ onClose }) => {
        return (
          <Box p={0} overflow={'hidden'}>
            <Flex
              alignItems={'flex-start'}
              gap={3}
              px={4}
              py={3.5}
              bg={'linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 100%)'}
              borderBottom={'1px solid rgba(148, 163, 184, 0.18)'}
            >
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={'34px'}
                h={'34px'}
                flexShrink={0}
                borderRadius={'10px'}
                bg={'#2563EB'}
                color={'white'}
              >
                <MyIcon name={'common/warn'} w={'17px'} />
              </Flex>
              <Box minW={0}>
                <Box color={'#1E293B'} fontSize={'14px'} fontWeight={800}>
                  {t('app:logs_key_config')}
                </Box>
                <Box mt={1} color={'#64748B'} fontSize={'12px'} lineHeight={1.45}>
                  {t('app:sync_log_keys_popover_text')}
                </Box>
              </Box>
            </Flex>
            <Flex flexDirection={'column'} gap={2.5} p={3} bg={'#F8FAFC'}>
              <Button
                variant={'whiteBase'}
                h={'auto'}
                minH={'48px'}
                justifyContent={'flex-start'}
                borderRadius={'12px'}
                borderColor={'rgba(148, 163, 184, 0.2)'}
                leftIcon={<MyIcon name={'common/refresh'} w={'16px'} color={'#2563EB'} />}
                onClick={() => {
                  setLogKeys(teamLogKeys);
                  onClose();
                }}
              >
                {t('app:sync_team_app_log_keys')}
              </Button>
              <Button
                h={'auto'}
                minH={'48px'}
                justifyContent={'flex-start'}
                borderRadius={'12px'}
                leftIcon={<MyIcon name={'save'} w={'16px'} color={'white'} />}
                isLoading={updateLoading}
                onClick={async () => {
                  await updateList({
                    appId: appId,
                    logKeys
                  });
                  onClose();
                }}
              >
                {t('app:save_team_app_log_keys')}
              </Button>
            </Flex>
          </Box>
        );
      }}
    </MyPopover>
  );
};

export default SyncLogKeysPopover;
