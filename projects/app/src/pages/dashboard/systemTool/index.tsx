'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import { getTeamSystemPluginList, postToggleInstallPlugin } from '@/web/core/plugin/team/api';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo, useState, useReducer, useRef } from 'react';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import { useUserStore } from '../../../web/support/user/useUserStore';
import { useRouter } from 'next/router';
import { getDocPath } from '@/web/common/system/doc';
import type { GetTeamPluginListResponseType } from '@fastgpt/global/openapi/core/plugin/team/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getTeamToolDetail } from '@/web/core/plugin/team/api';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { omniTheme } from '@/web/common/brand/theme';

type LoadingAction = { type: 'TRY_ADD'; pluginId: string } | { type: 'REMOVE'; pluginId: string };

const loadingReducer = (state: Set<string>, action: LoadingAction): Set<string> => {
  if (action.type === 'TRY_ADD') {
    if (state.has(action.pluginId)) {
      return state;
    }
    const newSet = new Set(state);
    newSet.add(action.pluginId);
    return newSet;
  }
  if (action.type === 'REMOVE') {
    if (!state.has(action.pluginId)) {
      return state;
    }
    const newSet = new Set(state);
    newSet.delete(action.pluginId);
    return newSet;
  }
  return state;
};

const ToolKitProvider = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();

  const [installedFilter, setInstalledFilter] = useState<'all' | 'installed' | 'uninstalled'>(
    'all'
  );
  const [searchText, setSearchText] = useState('');

  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [loadingPluginIds, dispatchLoading] = useReducer(loadingReducer, new Set<string>());
  const loadingPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { data: tags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

  // TODO: 把 filter 放到后端
  const [tools, setTools] = useState<GetTeamPluginListResponseType>([]);
  const { loading: loadingTools } = useRequest(() => getTeamSystemPluginList({ type: 'tool' }), {
    manual: false,
    onSuccess(data) {
      setTools(data);
    }
  });

  const { runAsync: toggleInstall } = useRequest(
    async (data: { pluginId: string; installed: boolean }) => {
      const existingPromise = loadingPromisesRef.current.get(data.pluginId);
      if (existingPromise) {
        await existingPromise;
        return;
      }

      const operationPromise = (async () => {
        dispatchLoading({ type: 'TRY_ADD', pluginId: data.pluginId });

        try {
          await postToggleInstallPlugin({
            ...data,
            type: 'tool'
          });
          setTools((prev) =>
            prev.map((t) => (t.id === data.pluginId ? { ...t, installed: data.installed } : t))
          );
        } finally {
          dispatchLoading({ type: 'REMOVE', pluginId: data.pluginId });
          loadingPromisesRef.current.delete(data.pluginId);
        }
      })();
      loadingPromisesRef.current.set(data.pluginId, operationPromise);

      await operationPromise;
    },
    {
      manual: true
    }
  );

  const displayTools = useMemo(() => {
    return tools
      .filter((tool) => {
        if (!searchText) return true;
        const name = tool.name.toLowerCase();
        const intro = tool.intro?.toLowerCase() || '';
        const search = searchText.toLowerCase();
        return name.includes(search) || intro.includes(search);
      })
      .filter((tool) => {
        if (selectedTagIds.length === 0) return true;
        return tool.tags?.some((tagId) => selectedTagIds.includes(tagId));
      })
      .filter((tool) => {
        if (installedFilter === 'all') return true;
        const isInstalled = tool.installed;
        if (installedFilter === 'installed') return !!isInstalled;
        if (installedFilter === 'uninstalled') return !isInstalled;
        return true;
      })
      .map<ToolCardItemType>((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.intro,
        icon: tool.avatar,
        author: tool.author,
        tags: tool.tags?.map((tagId) =>
          parseI18nString(tags.find((tag) => tag.tagId === tagId)?.tagName || '', i18n.language)
        ),
        status: tool.status,
        installed: tool.installed,
        associatedPluginId: tool.associatedPluginId
      }));
  }, [tools, searchText, selectedTagIds, installedFilter, tags, i18n.language]);

  return (
    <Box h={'full'} px={[3, 6]} py={[4, 6]} overflow={'hidden'}>
      <MyBox
        bg={'transparent'}
        h={'full'}
        rounded={0}
        boxShadow={'none'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools && displayTools.length === 0}
      >
        <Box flexShrink={0}>
          {isPc && (
            <Flex alignItems={'center'} mb={5}>
              <Box flex={'1 0 0'}>
                <Box
                  fontSize={'22px'}
                  fontWeight={900}
                  color={omniTheme.colors.text}
                  lineHeight={1.2}
                >
                  {t('app:core.module.template.System Tools')}
                </Box>
                <Box mt={1} color={omniTheme.colors.muted} fontSize={'sm'}>
                  管理团队可用的系统工具能力
                </Box>
              </Box>
              {feConfigs?.docUrl && (
                <Button
                  mr={4}
                  bg={omniTheme.colors.graphite}
                  color={'white'}
                  _hover={{ bg: omniTheme.colors.graphiteHover }}
                  onClick={() =>
                    window.open(
                      getDocPath('/docs/introduction/guide/plugins/dev_system_tool'),
                      '_blank'
                    )
                  }
                >
                  {t('app:toolkit_contribute_resource')}
                </Button>
              )}
              {feConfigs?.submitPluginRequestUrl && (
                <Button
                  variant={'whiteBase'}
                  borderColor={omniTheme.colors.border}
                  onClick={() => {
                    window.open(feConfigs.submitPluginRequestUrl);
                  }}
                >
                  {t('app:toolkit_marketplace_submit_request')}
                </Button>
              )}
            </Flex>
          )}
          {/* Tags */}
          <Flex
            mt={2}
            mb={4}
            alignItems={'center'}
            border={'1px solid'}
            borderColor={omniTheme.colors.border}
            bg={'rgba(255, 255, 255, 0.78)'}
            borderRadius={'12px'}
            px={3}
            py={2}
          >
            <Flex alignItems={'start'} flex={'1 0 0'} w={0} mr={[3, 10]}>
              {!isPc && (
                <Box mr={2} mt={2}>
                  {MenuIcon}
                </Box>
              )}
              {isPc && (
                <Flex
                  alignItems={'center'}
                  transition={'all 0.3s'}
                  w={isSearchExpanded ? '320px' : 'auto'}
                  mr={4}
                >
                  {isSearchExpanded ? (
                    <InputGroup>
                      <MyIcon
                        position={'absolute'}
                        zIndex={10}
                        left={2.5}
                        name={'common/searchLight'}
                        w={5}
                        color={'primary.600'}
                        top={'50%'}
                        transform={'translateY(-50%)'}
                      />
                      <Input
                        px={8}
                        h={'35px'}
                        borderRadius={'8px'}
                        borderColor={omniTheme.colors.border}
                        placeholder={t('common:search_tool')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        autoFocus
                        onBlur={() => {
                          if (!searchText) {
                            setIsSearchExpanded(false);
                          }
                        }}
                      />
                      {searchText && (
                        <MyIcon
                          position={'absolute'}
                          zIndex={10}
                          right={2.5}
                          name={'common/closeLight'}
                          w={4}
                          top={'50%'}
                          transform={'translateY(-50%)'}
                          color={'myGray.500'}
                          cursor={'pointer'}
                          onClick={() => {
                            setSearchText('');
                            setIsSearchExpanded(false);
                          }}
                        />
                      )}
                    </InputGroup>
                  ) : (
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      cursor={'pointer'}
                      borderRadius={'md'}
                      _hover={{ bg: 'myGray.100' }}
                      onClick={() => setIsSearchExpanded(true)}
                      p={2}
                      h={'35px'}
                      border={'1px solid'}
                      borderColor={omniTheme.colors.border}
                      bg={'white'}
                    >
                      <MyIcon
                        name={'common/searchLight'}
                        w={5}
                        color={omniTheme.colors.saturatedBlue}
                        mr={2}
                      />
                      <Box fontSize={'sm'} fontWeight={700} color={omniTheme.colors.muted}>
                        {t('common:Search')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              )}
              <Box flex={'1'} overflow={'auto'} mb={-1}>
                <ToolTagFilterBox
                  tags={tags}
                  selectedTagIds={selectedTagIds}
                  onTagSelect={setSelectedTagIds}
                />
              </Box>
            </Flex>

            <MyMenu
              trigger="hover"
              Button={
                <Flex alignItems={'center'} cursor={'pointer'} pl={1}>
                  <MyIcon name="core/chat/chevronDown" w={4} mr={1} />
                  <Box fontSize={'12px'} fontWeight={800} color={omniTheme.colors.graphite}>
                    {installedFilter === 'installed'
                      ? t('app:toolkit_installed')
                      : installedFilter === 'uninstalled'
                        ? t('app:toolkit_uninstalled')
                        : t('common:All')}
                  </Box>
                </Flex>
              }
              menuList={[
                {
                  children: [
                    {
                      label: t('common:All'),
                      onClick: () => setInstalledFilter('all'),
                      isActive: installedFilter === 'all'
                    },
                    {
                      label: t('app:toolkit_installed'),
                      onClick: () => setInstalledFilter('installed'),
                      isActive: installedFilter === 'installed'
                    },
                    {
                      label: t('app:toolkit_uninstalled'),
                      onClick: () => setInstalledFilter('uninstalled'),
                      isActive: installedFilter === 'uninstalled'
                    }
                  ]
                }
              ]}
            />
          </Flex>
        </Box>

        <Box flex={1} overflowY={'auto'} pb={6}>
          {displayTools.length > 0 ? (
            <Grid
              gridTemplateColumns={[
                '1fr',
                'repeat(2,1fr)',
                'repeat(3,1fr)',
                'repeat(4,1fr)',
                'repeat(4,1fr)'
              ]}
              gridGap={4}
              alignItems={'stretch'}
            >
              {displayTools.map((tool) => {
                return (
                  <ToolCard
                    key={tool.id}
                    item={tool}
                    systemTitle={feConfigs?.systemTitle}
                    mode="team"
                    variant="omniRail"
                    onInstall={() => toggleInstall({ pluginId: tool.id, installed: true })}
                    onDelete={() => toggleInstall({ pluginId: tool.id, installed: false })}
                    onClickCard={() => setSelectedTool(tool)}
                    isInstallingOrDeleting={loadingPluginIds.has(tool.id)}
                  />
                );
              })}
            </Grid>
          ) : (
            <VStack>
              {!loadingTools && (
                <>
                  <EmptyTip pb={4} />
                  {userInfo?.username === 'root' && (
                    <Button
                      onClick={() => {
                        router.push('/config/tool');
                      }}
                      w={'160px'}
                    >
                      {t('app:click_to_config')}
                    </Button>
                  )}
                </>
              )}
            </VStack>
          )}
        </Box>
      </MyBox>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={() => setSelectedTool(null)}
          selectedTool={selectedTool}
          showPoint={false}
          onToggleInstall={(installed) => {
            if (selectedTool) {
              toggleInstall({ pluginId: selectedTool.id, installed });
            }
          }}
          systemTitle={feConfigs.systemTitle}
          isLoading={loadingPluginIds.has(selectedTool.id)}
          onFetchDetail={async (toolId: string) => {
            const res = await getTeamToolDetail({ toolId });
            return {
              tools: res.tools,
              downloadUrl: ''
            };
          }}
          mode="team"
        />
      )}
    </Box>
  );
};

function ContextRender() {
  return (
    <DashboardContainer>
      {({ MenuIcon }) => <ToolKitProvider MenuIcon={MenuIcon} />}
    </DashboardContainer>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app']))
    }
  };
}
