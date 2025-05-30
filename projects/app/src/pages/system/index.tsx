import React, { useEffect, useState } from 'react';
import { Box, Button, Flex, Tabs, TabList, TabPanels, TabPanel, Tab } from '@chakra-ui/react';
import PageContainer from '@/components/PageContainer';
import dynamic from 'next/dynamic';
import { createSystemConfig, getSystemConfig } from '@/web/support/system/api';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSystemMsgModalData, updateSystemMsgModalData } from '@/web/support/user/inform/api';

const MonacoEditor = dynamic(() => import('./component/MonacoEditor'), { ssr: false });
const MarkdownEditor = dynamic(() => import('./component/MarkdownEditor'), { ssr: false });

interface SystemMsgData {
  id: string;
  content: string;
}

const System = () => {
  const [code, setCode] = useState<string>('{"desc":"it is a config.json"}');
  const [systemMsg, setSystemMsg] = useState<string>('');
  const [tabIndex, setTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { Loading } = useLoading();
  const { t } = useTranslation();

  // 获取系统配置
  const {
    data: configData,
    isLoading: isConfigLoading,
    mutate: runGetSystemConfig
  } = useRequest({
    mutationFn: () => getSystemConfig(),
    onSuccess: (data) => {
      setCode(JSON.stringify(data, null, 4));
      setIsLoading(false);
    },
    onError: (err) => {
      setIsLoading(false);
    },
    errorToast: ''
  });

  // 获取系统消息
  const {
    data: systemMsgData,
    isLoading: isSystemMsgLoading,
    mutate: runGetSystemMsg
  } = useRequest({
    // 添加类型参数
    mutationFn: () => getSystemMsgModalData(),
    onSuccess: (data: SystemMsgData) => {
      setSystemMsg(data.content);
      setIsLoading(false);
    },
    onError: (err) => {
      setIsLoading(false);
    },
    errorToast: ''
  });

  // 保存系统配置
  const { mutate: handleSave, isLoading: isSaving } = useRequest({
    mutationFn: () => createSystemConfig(JSON.parse(code) as FastGPTConfigFileType),
    onSuccess() {
      getSystemConfig().then((res) => {
        setCode(JSON.stringify(res, null, 4));
      });
    },
    successToast: t('common:update_success'),
    errorToast: ''
  });

  // 保存系统消息
  const { mutate: handleSaveSystemMsg, isLoading: isSavingSystemMsg } = useRequest({
    mutationFn: () => updateSystemMsgModalData({ content: systemMsg }),
    onSuccess() {
      getSystemMsgModalData().then((res) => {
        setSystemMsg(res.content);
      });
    },
    successToast: t('common:update_success'),
    errorToast: ''
  });

  useEffect(() => {
    runGetSystemConfig({});
    runGetSystemMsg({});
  }, [runGetSystemConfig, runGetSystemMsg]);

  return (
    <>
      <Tabs h="95%" index={tabIndex} onChange={setTabIndex} mt={5}>
        <TabList w="100%" borderBottom="0">
          <Tab>配置文件</Tab>
          <Tab>系统消息编辑</Tab>
        </TabList>

        <TabPanels h="100%">
          <TabPanel
            h="100%"
            style={{
              padding: 0,
              border: 'none',
              boxSizing: 'border-box'
            }}
          >
            <PageContainer h="100%">
              <Flex h="100%" flexDirection="column" position="relative">
                <Flex position="absolute" top={8} right={3} zIndex={10} alignItems="center">
                  <PopoverConfirm
                    showCancel
                    content={t('common:confirm_update')}
                    Trigger={
                      <Button
                        size={'sm'}
                        leftIcon={<MyIcon name={'common/saveFill'} w={['14px', '16px']} />}
                      >
                        {t('common:Save')}
                      </Button>
                    }
                    onConfirm={() => {
                      handleSave({});
                    }}
                  />
                </Flex>

                <Box
                  flex={1}
                  mt={0}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    border: 0,
                    position: 'relative'
                  }}
                >
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
              </Flex>
            </PageContainer>
          </TabPanel>

          <TabPanel
            h="100%"
            w="100%"
            style={{
              padding: 0,
              border: 'none',
              boxSizing: 'border-box'
            }}
          >
            <PageContainer h="100%" w="100%">
              <Flex h="100%" flexDirection="column" position="relative" alignItems="center">
                <Flex position="absolute" top={8} right={3} zIndex={10} alignItems="center">
                  <PopoverConfirm
                    showCancel
                    content={t('common:confirm_update')}
                    Trigger={
                      <Button
                        size={'sm'}
                        leftIcon={<MyIcon name={'common/saveFill'} w={['14px', '16px']} />}
                      >
                        {t('common:Save')}
                      </Button>
                    }
                    onConfirm={() => {
                      handleSaveSystemMsg({});
                    }}
                  />
                </Flex>

                {/* 编辑器区域 - 与按钮顶部对齐 */}
                <Box
                  flex={1}
                  mt={0}
                  width={'90%'}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    border: 0,
                    position: 'relative'
                  }}
                >
                  <MarkdownEditor
                    value={systemMsg}
                    setCode={setSystemMsg}
                    editorLoading={<div>Loading editor...</div>}
                  />
                </Box>
              </Flex>
            </PageContainer>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Loading fixed={false} loading={isLoading || isSaving || isSavingSystemMsg} />
    </>
  );
};

export default System;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
