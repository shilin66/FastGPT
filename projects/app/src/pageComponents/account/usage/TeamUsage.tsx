import {
  Box,
  Button,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import {
  type TeamUsageItemType,
  type UsageItemType
} from '@fastgpt/global/support/wallet/usage/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getTeamUsage, usageStats } from '@/web/support/wallet/usage/api';
import { addDays } from 'date-fns';
import { type UsageFilterParams } from './type';
import TeamUsageDetail from '@/pageComponents/account/usage/TeamUsageDetail';
import type { TooltipProps } from 'recharts';
import { Bar, Cell } from 'recharts';
import { BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

export type teamUsageFormType = {
  teamName: string;
  totalPoints: number;
};

const CustomTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  const data = payload?.[0]?.payload as teamUsageFormType;
  const { t } = useTranslation();
  if (active && data) {
    return (
      <Box
        bg={'white'}
        p={3}
        borderRadius={'md'}
        border={'0.5px solid'}
        borderColor={'myGray.200'}
        boxShadow={
          '0px 24px 48px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)'
        }
      >
        <Box fontSize={'mini'} color={'myGray.600'} mb={3}>
          {data.teamName}
        </Box>
        <Box fontSize={'14px'} color={'myGray.900'} fontWeight={'medium'}>
          {`${formatNumber(data.totalPoints)} ${t('account_usage:points')}`}
        </Box>
      </Box>
    );
  }
  return null;
};

const TeamUsageTableList = ({
  filterParams,
  Tabs,
  Selectors
}: {
  Tabs: React.ReactNode;
  Selectors: React.ReactNode;
  filterParams: UsageFilterParams;
}) => {
  const { t } = useTranslation();

  const { dateRange, teamSearchKey } = filterParams;
  const requestParams = useMemo(() => {
    return {
      dateStart: dayjs(dateRange.from || new Date()).format(),
      dateEnd: dayjs(addDays(dateRange.to || new Date(), 1)).format(),
      // teamIds: isSelectAllTeam ? undefined : selectTeamIds,
      searchKey: teamSearchKey
    };
  }, [dateRange.from, dateRange.to, teamSearchKey]);

  const {
    data: usages,
    isLoading,
    Pagination,
    total
  } = usePagination(getTeamUsage, {
    pageSize: 10,
    params: requestParams,
    refreshDeps: [requestParams]
  });

  const { data: usageStatsData, loading: isLoadingStats } = useRequest2(
    async () => usageStats({ dateStart: requestParams.dateStart, dateEnd: requestParams.dateEnd }),
    {
      manual: false,
      refreshDeps: [requestParams.dateStart, requestParams.dateEnd]
    }
  );
  const platformTotalPoint = usageStatsData?.platformTotalPoint || 0;
  const [teamUsages, setTeamUsages] = useState<TeamUsageItemType>();

  return (
    <>
      <Box>{Tabs}</Box>
      <Flex mt={4} w={'100%'}>
        <Box>{Selectors}</Box>
        <Box flex={'1'} />
      </Flex>
      <MyBox overflowY={'auto'} isLoading={isLoading && isLoadingStats}>
        <Flex fontSize={'20px'} fontWeight={'medium'} my={6}>
          <Box color={'black'}>{`${t('account_usage:total_usage')}:`}</Box>
          <Box color={'primary.600'} ml={2}>
            {`${formatNumber(platformTotalPoint)} ${t('account_usage:points')}`}
          </Box>
        </Flex>
        <Flex mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'}>
          {t('account_usage:points')}
        </Flex>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={usages} margin={{ top: 10, right: 30, left: -12, bottom: 0 }}>
            <defs>
              {/* 渐变色 */}
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#6366F1" stopOpacity={0.6} />
              </linearGradient>
              {/* 阴影滤镜 */}
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.1" />
              </filter>
            </defs>
            <XAxis
              dataKey="teamName"
              padding={{ left: 40, right: 40 }}
              tickMargin={12}
              tickSize={0}
              tick={{ fontSize: 12, fill: '#4B5563', fontWeight: 500 }}
            />
            <YAxis
              axisLine={false}
              tickSize={0}
              tickMargin={12}
              tick={{ fontSize: 12, fill: '#4B5563', fontWeight: 500 }}
            />
            <CartesianGrid
              strokeDasharray="4 4"
              horizontal={true}
              vertical={false}
              stroke="#E5E7EB"
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
            <Bar
              dataKey="totalPoints"
              fill="url(#barGradient)"
              radius={[6, 6, 0, 0]}
              barSize={28}
              filter="url(#shadow)"
              isAnimationActive={true}
              animationDuration={800}
            >
              {/* 在柱顶显示数值 */}
              {usages.map((entry, index) => (
                <Cell key={`cell-${index}`}>
                  <text
                    x={0}
                    y={0}
                    dy={-6}
                    textAnchor="middle"
                    fill="#374151"
                    fontSize="12px"
                    fontWeight="600"
                  >
                    {entry.totalPoints}
                  </text>
                </Cell>
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </MyBox>
      <MyBox mt={3} flex={'1 0 0'} h={0} isLoading={isLoading}>
        <Box h={'100%'} overflow={'auto'}>
          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('common:Team')}</Th>
                  <Th>{t('account_team:owner')}</Th>
                  <Th>{'Input Tokens'}</Th>
                  <Th>{'Output Tokens'}</Th>
                  <Th>{'Total Tokens'}</Th>
                  <Th>{t('account_usage:total_points')}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody fontSize={'sm'}>
                {usages.map((item) => (
                  <Tr key={item.id}>
                    <Td>
                      <Flex alignItems={'center'} color={'myGray.500'}>
                        <Avatar src={item.teamAvatar} w={'20px'} mr={1} rounded={'full'} />
                        {item.teamName}
                      </Flex>
                    </Td>
                    <Td>{item.owner}</Td>
                    <Td>{item.totalInputTokens || 0}</Td>
                    <Td>{item.totalOutputTokens || 0}</Td>
                    <Td>{item.totalTokens || 0}</Td>
                    <Td>{formatNumber(item.totalPoints) || 0}</Td>
                    <Td>
                      <Button
                        size={'sm'}
                        variant={'whitePrimary'}
                        onClick={() => setTeamUsages(item)}
                      >
                        {t('account_usage:details')}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {!isLoading && usages.length === 0 && (
              <EmptyTip text={t('account_usage:no_usage_records')}></EmptyTip>
            )}
          </TableContainer>
        </Box>
      </MyBox>
      <Flex mt={3} justifyContent={'center'}>
        <Pagination />
      </Flex>

      {!!teamUsages && (
        <TeamUsageDetail usage={teamUsages} onClose={() => setTeamUsages(undefined)} />
      )}
    </>
  );
};

export default React.memo(TeamUsageTableList);
