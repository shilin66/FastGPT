import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getLLMRequestRecordAPI } from '@/web/core/ai/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import dynamic from 'next/dynamic';
import { ResizableRightPanel } from '@/components/common/ResizableRightPanel';

const CodeEditor = dynamic(
  () => import('@fastgpt/web/components/common/Textarea/CodeEditor/Editor'),
  {
    ssr: false
  }
);

type RequestIdDetailModalProps = {
  onClose: () => void;
  requestId: string;
};

export const RequestIdDetailModal = ({ onClose, requestId }: RequestIdDetailModalProps) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();

  const { data: record, loading } = useRequest(() => getLLMRequestRecordAPI(requestId), {
    manual: false,
    onError: () => {
      toast({
        status: 'error',
        isClosable: true
      });
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  });

  const formatJson = useMemo(() => (data: unknown) => JSON.stringify(data, null, 2), []);

  return (
    <ResizableRightPanel
      onClose={onClose}
      isLoading={loading}
      initialWidth={1080}
      minWidth={760}
      maxWidth={1280}
      bodyProps={{ py: 4 }}
      title={
        <Box fontSize={'20px'} lineHeight={'26px'} letterSpacing={'0.15px'} fontWeight={800}>
          {t('chat:llm_request_detail')}
        </Box>
      }
    >
      {record && (
        <Flex height={'100%'} mx={[3, 4]} gap={3} flexDirection={['column', 'row']} minH={0}>
          <Flex flex={1} flexDirection={'column'} gap={2} minW={0} minH={0}>
            <Box
              fontSize={'12px'}
              lineHeight={'16px'}
              fontWeight={800}
              color={'#1E293B'}
              letterSpacing={0}
            >
              {t('chat:request_body')}
            </Box>
            <Box
              flex={'1 0 0'}
              h={0}
              minH={['260px', 0]}
              bg={'white'}
              border={'1px solid'}
              borderColor={'rgba(37, 99, 235, 0.16)'}
              borderRadius={'14px'}
              overflow={'hidden'}
              boxShadow={'0 14px 34px rgba(15, 23, 42, 0.05)'}
            >
              <CodeEditor
                value={formatJson(record.body)}
                language="json"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false
                }}
                h={'100%'}
              />
            </Box>
          </Flex>

          <Flex flex={1} flexDirection={'column'} gap={2} minW={0} minH={0}>
            <Box
              fontSize={'12px'}
              lineHeight={'16px'}
              fontWeight={800}
              color={'#1E293B'}
              letterSpacing={0}
            >
              {t('chat:response_content')}
            </Box>
            <Box
              flex={'1 0 0'}
              h={0}
              minH={['260px', 0]}
              bg={'white'}
              border={'1px solid'}
              borderColor={'rgba(37, 99, 235, 0.16)'}
              borderRadius={'14px'}
              overflow={'hidden'}
              boxShadow={'0 14px 34px rgba(15, 23, 42, 0.05)'}
            >
              <CodeEditor
                value={formatJson(record.response)}
                language="json"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false
                }}
                h={'100%'}
              />
            </Box>
          </Flex>
        </Flex>
      )}
    </ResizableRightPanel>
  );
};

export default RequestIdDetailModal;
