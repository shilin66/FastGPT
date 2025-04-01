import React, { useEffect, useState } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import PageContainer from '@/components/PageContainer';
import dynamic from 'next/dynamic';
import { createSystemConfig, getSystemConfig } from '@/web/support/system/api';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

const MonacoEditor = dynamic(() => import('./component/MonacoEditor'), { ssr: false });

const System = () => {
  const [code, setCode] = useState<string>('{"desc":"it is a config.json"}');
  const [isLoading, setIsLoading] = useState(true);
  const { Loading } = useLoading();
  const { t } = useTranslation();

  // 使用 useRequest 来获取系统配置
  const {
    data: configData,
    isLoading: isConfigLoading,
    mutate: runGetSystemConfig
  } = useRequest({
    mutationFn: () => {
      return getSystemConfig();
    },
    onSuccess: (data) => {
      setCode(JSON.stringify(data, null, 4));
      setIsLoading(false);
    },
    onError: (err) => {
      setIsLoading(false);
    },
    errorToast: ''
  });

  const { mutate: handleSave, isLoading: isSaving } = useRequest({
    mutationFn: () => {
      return createSystemConfig(JSON.parse(code) as FastGPTConfigFileType);
    },
    onSuccess() {
      getSystemConfig().then((res) => {
        setCode(JSON.stringify(res, null, 4));
      });
    },
    successToast: t('common:common.Update Success'),
    errorToast: ''
  });

  useEffect(() => {
    runGetSystemConfig({});
  }, [runGetSystemConfig]);
  return (
    <>
      <Flex
        pt={[0, 3]}
        pr={[0, '16px']}
        alignItems={'flex-start'}
        position={'relative'}
        justifyContent="flex-end"
      >
        <PopoverConfirm
          showCancel
          content={t('common:common.Confirm Update')}
          Trigger={
            <Button
              ml={[2, 4]}
              size={'sm'}
              leftIcon={<MyIcon name={'common/saveFill'} w={['14px', '16px']} />}
            >
              {t('common:common.Save')}
            </Button>
          }
          onConfirm={() => {
            handleSave({});
          }}
        />
      </Flex>
      <PageContainer h={'95%'}>
        <Box h={'100%'} style={{ display: 'flex', justifyContent: 'center', border: 0 }}>
          <MonacoEditor
            value={code}
            setCode={setCode}
            editorLoading={
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#1E1E1E'
                }}
              >
                <Loading fixed={false} loading={true} />
              </div>
            }
          />
        </Box>
      </PageContainer>
      <Loading fixed={false} loading={isLoading || isSaving} />
    </>
  );
};

export default System;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
