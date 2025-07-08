import React, { useMemo } from 'react';
import {
  ModalBody,
  Flex,
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer
} from '@chakra-ui/react';
import type { TeamUsageItemType } from '@fastgpt/global/support/wallet/usage/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const TeamUsageDetail = ({ usage, onClose }: { usage: TeamUsageItemType; onClose: () => void }) => {
  const { t } = useTranslation();
  const filterBillList = useMemo(
    () => usage.models.filter((item) => item && item.name),
    [usage.models]
  );

  const { hasModel, hasToken, hasInputToken, hasOutputToken, hasCharsLen, hasDuration, hasPages } =
    useMemo(() => {
      let hasModel = false;
      let hasToken = false;
      let hasInputToken = false;
      let hasOutputToken = false;
      let hasCharsLen = false;
      let hasDuration = false;
      let hasPages = false;

      usage.models.forEach((item) => {
        if (item.name !== undefined) {
          hasModel = true;
        }

        if (item.allTokens) {
          hasToken = true;
        }
        if (item.inputTokens) {
          hasInputToken = true;
        }
        if (item.outputTokens) {
          hasOutputToken = true;
        }
        if (item.charsLength) {
          hasCharsLen = true;
        }
        if (item.duration) {
          hasDuration = true;
        }
        if (item.pages) {
          hasPages = true;
        }
      });

      return {
        hasModel,
        hasToken,
        hasInputToken,
        hasOutputToken,
        hasCharsLen,
        hasDuration,
        hasPages
      };
    }, [usage.models]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/bill.svg"
      title={t('account_usage:usage_detail')}
      maxW={['90vw', '800px']}
    >
      <ModalBody>
        <Flex alignItems={'center'} pb={4}>
          <FormLabel flex={'0 0 80px'}>{t('account_usage:total_points_consumed')}:</FormLabel>
          <Box fontWeight={'bold'}>{formatNumber(usage.totalPoints)}</Box>
        </Flex>
        <Box pb={4}>
          <FormLabel flex={'0 0 80px'} mb={1}>
            {t('account_usage:billing_module')}
          </FormLabel>
          <TableContainer fontSize={'sm'}>
            <Table>
              <Thead>
                <Tr>
                  {hasModel && <Th>{t('account_usage:ai_model')}</Th>}
                  {hasToken && <Th>{t('account_usage:token_length')}</Th>}
                  {hasInputToken && <Th>{t('account_usage:input_token_length')}</Th>}
                  {hasOutputToken && <Th>{t('account_usage:output_token_length')}</Th>}
                  <Th>{t('account_usage:total_points_consumed')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filterBillList.map((item, i) => (
                  <Tr key={i}>
                    {hasModel && <Td>{item.name ?? '-'}</Td>}
                    {hasToken && <Td>{item.allTokens ?? '-'}</Td>}
                    {hasInputToken && <Td>{item.inputTokens ?? '-'}</Td>}
                    {hasOutputToken && <Td>{item.outputTokens ?? '-'}</Td>}
                    <Td>{formatNumber(item.amount)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {hasCharsLen && (
              <Table>
                <Thead>
                  <Tr>
                    {hasModel && <Th>{t('account_usage:ai_model')}</Th>}
                    {hasCharsLen && <Th>{t('account_usage:text_length')}</Th>}
                    <Th>{t('account_usage:total_points_consumed')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filterBillList
                    .filter((item) => item.charsLength && item.charsLength !== '0')
                    .map((item, i) => (
                      <Tr key={`char-${i}`}>
                        {hasModel && <Td>{item.name ?? '-'}</Td>}
                        {hasCharsLen && <Td>{item.charsLength ?? '-'}</Td>}
                        <Td>{formatNumber(item.amount)}</Td>
                      </Tr>
                    ))}
                </Tbody>
              </Table>
            )}
            {hasDuration && (
              <Table>
                <Thead>
                  <Tr>
                    {hasModel && <Th>{t('account_usage:ai_model')}</Th>}
                    {hasCharsLen && <Th>{t('account_usage:duration_seconds')}</Th>}
                    <Th>{t('account_usage:total_points_consumed')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filterBillList
                    .filter((item) => item.duration && item.duration !== '0')
                    .map((item, i) => (
                      <Tr key={i}>
                        {hasModel && <Td>{item.name ?? '-'}</Td>}
                        {hasCharsLen && <Td>{item.duration ?? '-'}</Td>}
                        <Td>{formatNumber(item.amount)}</Td>
                      </Tr>
                    ))}
                </Tbody>
              </Table>
            )}
            {hasPages && (
              <Table>
                <Thead>
                  <Tr>
                    {hasModel && <Th>{t('account_usage:ai_model')}</Th>}
                    {hasCharsLen && <Th>{t('account_usage:pages')}</Th>}
                    <Th>{t('account_usage:total_points_consumed')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filterBillList
                    .filter((item) => item.pages && item.pages !== '0')
                    .map((item, i) => (
                      <Tr key={i}>
                        {hasModel && <Td>{item.name ?? '-'}</Td>}
                        {hasCharsLen && <Td>{item.pages ?? '-'}</Td>}
                        <Td>{formatNumber(item.amount)}</Td>
                      </Tr>
                    ))}
                </Tbody>
              </Table>
            )}
          </TableContainer>
        </Box>
      </ModalBody>
    </MyModal>
  );
};

export default TeamUsageDetail;
