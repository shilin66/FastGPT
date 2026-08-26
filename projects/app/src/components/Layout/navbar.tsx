import React, { useMemo } from 'react';
import { Box, Button, Flex, IconButton, Link } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import NextLink from 'next/link';
import Badge from '../Badge';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { OMNICOCKPIT_NAME } from '@/web/common/brand/constants';
import { omniTheme } from '@/web/common/brand/theme';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

export enum NavbarTypeEnum {
  normal = 'normal',
  small = 'small'
}

type NavItemType = {
  label: string;
  icon: string;
  activeIcon?: string;
  link: string;
  activeLink: string[];
  activeQuery?: Record<string, string>;
  depth?: number;
  unread?: number;
  action?: 'logout';
};

type NavGroupType = {
  title: string;
  items: NavItemType[];
};

type NavbarProps = {
  unread: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

const getIsActive = (
  pathname: string,
  query: Record<string, string | string[] | undefined>,
  item: NavItemType
) => {
  if (!item.activeLink.includes(pathname)) return false;

  if (item.activeQuery) {
    return Object.entries(item.activeQuery).every(([key, value]) => {
      const queryValue = query[key];
      return Array.isArray(queryValue) ? queryValue.includes(value) : queryValue === value;
    });
  }

  return true;
};

const Navbar = ({ unread, isCollapsed = false, onToggleCollapse }: NavbarProps) => {
  const router = useRouter();
  const { userInfo, setUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const { lastChatAppId, lastPane } = useChatStore();
  const { openConfirm: openLogoutConfirm, ConfirmModal: LogoutConfirmModal } = useConfirm({
    content: '确认退出登录？'
  });

  const navGroups = useMemo<NavGroupType[]>(() => {
    const workspaceItems: NavItemType[] = [
      {
        label: '门户',
        icon: 'navbar/chatLight',
        activeIcon: 'navbar/chatFill',
        link: `/chat?appId=${lastChatAppId}&pane=${lastPane}`,
        activeLink: ['/chat']
      },
      {
        label: 'Agent 管理',
        icon: 'navbar/dashboardLight',
        activeIcon: 'navbar/dashboardFill',
        link: '/dashboard/agent',
        activeLink: ['/dashboard/agent', '/dashboard/create', '/app/detail']
      },
      {
        label: '知识库',
        icon: 'navbar/datasetLight',
        activeIcon: 'navbar/datasetFill',
        link: '/dataset/list',
        activeLink: ['/dataset/list', '/dataset/detail']
      },
      ...(feConfigs?.show_skill
        ? [
            {
              label: '技能库',
              icon: 'common/skill',
              link: '/dashboard/skill',
              activeLink: ['/dashboard/skill', '/skill/detail']
            }
          ]
        : []),
      {
        label: '集成管理',
        icon: 'core/app/type/plugin',
        activeIcon: 'core/app/type/pluginFill',
        link: '/dashboard/tool',
        activeLink: ['/dashboard/tool']
      },
      {
        label: '系统工具',
        icon: 'common/app',
        link: '/dashboard/systemTool',
        activeLink: ['/dashboard/systemTool']
      },
      {
        label: 'MCP 服务',
        icon: 'mcp',
        link: '/dashboard/mcpServer',
        activeLink: ['/dashboard/mcpServer']
      }
    ];

    const manageItems: NavItemType[] = [
      {
        label: '资源库',
        icon: 'common/templateMarket',
        link: '/dashboard/templateMarket',
        activeLink: ['/dashboard/templateMarket']
      },
      ...(feConfigs?.isPlus
        ? [
            {
              label: '团队管理',
              icon: 'support/user/usersLight',
              link: '/account/team',
              activeLink: ['/account/team']
            },
            {
              label: '用量记录',
              icon: 'support/usage/usageRecordLight',
              link: '/account/usage',
              activeLink: ['/account/usage']
            }
          ]
        : []),
      {
        label: '模型供应商',
        icon: 'common/model',
        link: '/account/model',
        activeLink: ['/account/model']
      },
      ...(userInfo?.team?.permission.hasApikeyCreatePer
        ? [
            {
              label: 'API 密钥',
              icon: 'key',
              link: '/account/apikey',
              activeLink: ['/account/apikey', '/openapi']
            }
          ]
        : []),
      ...(feConfigs?.show_promotion && userInfo?.team?.permission.isOwner
        ? [
            {
              label: '推广记录',
              icon: 'support/account/promotionLight',
              link: '/account/promotion',
              activeLink: ['/account/promotion']
            }
          ]
        : [])
    ];

    const accountItems: NavItemType[] = [
      {
        label: '个人信息',
        icon: 'support/user/userLight',
        link: '/account/info',
        activeLink: ['/account/info', '/account/setting']
      },
      {
        label: '通知中心',
        icon: 'support/user/informLight',
        link: '/account/inform',
        activeLink: ['/account/inform'],
        unread
      },
      {
        label: '退出登录',
        icon: 'support/account/loginoutLight',
        link: '#logout',
        activeLink: [],
        action: 'logout'
      }
    ];

    const systemItems: NavItemType[] =
      userInfo?.username === 'root'
        ? [
            {
              label: '授权配置',
              icon: 'support/license/licenseConfigLight',
              link: '/account/licenseConfig',
              activeLink: ['/account/licenseConfig']
            },
            {
              label: '插件库',
              icon: 'support/config/configLight',
              activeIcon: 'support/config/configFill',
              link: '/config/tool',
              activeLink: ['/config/tool', '/config/tool/marketplace']
            },
            {
              label: '系统配置',
              icon: 'support/system/settingLight',
              activeIcon: 'support/system/settingFill',
              link: '/system',
              activeLink: ['/system']
            }
          ]
        : [];

    return [
      {
        title: '工作台',
        items: workspaceItems
      },
      {
        title: '管理',
        items: manageItems
      },
      {
        title: '个人',
        items: accountItems
      },
      ...(systemItems.length > 0
        ? [
            {
              title: '系统',
              items: systemItems
            }
          ]
        : [])
    ];
  }, [
    feConfigs?.isPlus,
    feConfigs?.show_promotion,
    feConfigs?.show_skill,
    lastChatAppId,
    lastPane,
    unread,
    userInfo?.team?.permission.hasApikeyCreatePer,
    userInfo?.team?.permission.isOwner,
    userInfo?.username
  ]);

  const customNavbarItems = useMemo(
    () => feConfigs?.navbarItems?.filter((item) => item.isActive) || [],
    [feConfigs?.navbarItems]
  );

  const navigate = (item: NavItemType) => {
    if (item.action === 'logout') {
      openLogoutConfirm({
        onConfirm: () => {
          setUserInfo(null);
          router.replace('/login');
        }
      })();
      return;
    }

    if (item.link === router.asPath) return;

    if (item.link.startsWith('/chat')) {
      window.open(getWebReqUrl(item.link), '_blank', 'noopener,noreferrer');
      return;
    }

    router.push(item.link);
  };

  return (
    <Flex
      flexDirection={'column'}
      pt={isCollapsed ? 4 : 5}
      h={'100%'}
      w={'100%'}
      userSelect={'none'}
      px={isCollapsed ? 2 : 3}
      pb={4}
      bg={omniTheme.colors.sidebarBg}
      borderRight={'1px solid'}
      borderColor={omniTheme.colors.border}
    >
      <Flex
        flex={'0 0 auto'}
        alignItems={'center'}
        justifyContent={isCollapsed ? 'center' : 'space-between'}
        flexDirection={isCollapsed ? 'column' : 'row'}
        gap={2}
        mb={4}
      >
        <Flex alignItems={'center'} gap={3} minW={0}>
          <MyTooltip label={OMNICOCKPIT_NAME} placement={isCollapsed ? 'right' : 'top'}>
            <Flex w={10} h={10} alignItems="center" justifyContent="center" flexShrink={0}>
              <MyImage w={9} h={9} src={LOGO_ICON} />
            </Flex>
          </MyTooltip>
          {!isCollapsed && (
            <Box minW={0}>
              <Box
                color={omniTheme.colors.text}
                fontSize={'md'}
                fontWeight={800}
                whiteSpace={'nowrap'}
              >
                {OMNICOCKPIT_NAME}
              </Box>
              <Box mt={0.5} color={omniTheme.colors.muted} fontSize={'11px'} noOfLines={1}>
                Agent & Knowledge Workspace
              </Box>
            </Box>
          )}
        </Flex>
        <MyTooltip label={isCollapsed ? '展开菜单' : '收起菜单'} placement="right">
          <IconButton
            aria-label={isCollapsed ? '展开菜单' : '收起菜单'}
            size={'sm'}
            minW={8}
            w={8}
            h={8}
            borderRadius={omniTheme.radii.md}
            variant={'whiteBase'}
            bg={'white'}
            border={'1px solid'}
            borderColor={omniTheme.colors.border}
            color={omniTheme.colors.muted}
            _hover={{
              color: omniTheme.colors.saturatedBlue,
              borderColor: omniTheme.colors.saturatedBlue
            }}
            icon={
              <MyIcon name={isCollapsed ? 'common/arrowRight' : 'common/arrowLeft'} w={'14px'} />
            }
            onClick={onToggleCollapse}
          />
        </MyTooltip>
      </Flex>

      {isCollapsed ? (
        <Flex flex={'0 0 auto'} flexDirection={'column'} alignItems={'center'} gap={2} mb={5}>
          <MyTooltip label={'新建 Agent'} placement="right">
            <IconButton
              aria-label={'新建 Agent'}
              h={10}
              minW={10}
              w={10}
              bg={omniTheme.colors.graphite}
              color={'white'}
              borderRadius={omniTheme.radii.md}
              _hover={{ bg: omniTheme.colors.graphiteHover }}
              icon={<MyIcon name={'common/addLight'} w={'16px'} />}
              onClick={() => router.push('/dashboard/create')}
            />
          </MyTooltip>
          <MyTooltip label={'导入知识库'} placement="right">
            <IconButton
              aria-label={'导入知识库'}
              h={10}
              minW={10}
              w={10}
              variant={'whiteBase'}
              bg={'white'}
              border={'1px solid'}
              borderColor={omniTheme.colors.border}
              borderRadius={omniTheme.radii.md}
              color={omniTheme.colors.text}
              _hover={{
                borderColor: omniTheme.colors.saturatedBlue,
                color: omniTheme.colors.saturatedBlue
              }}
              icon={<MyIcon name={'common/importLight'} w={'14px'} />}
              onClick={() => router.push('/dataset/list')}
            />
          </MyTooltip>
        </Flex>
      ) : (
        <Flex flex={'0 0 auto'} flexDirection={'column'} gap={2} mb={5}>
          <Button
            h={10}
            bg={omniTheme.colors.graphite}
            color={'white'}
            borderRadius={omniTheme.radii.md}
            fontWeight={800}
            _hover={{ bg: omniTheme.colors.graphiteHover }}
            leftIcon={<MyIcon name={'common/addLight'} w={'16px'} />}
            onClick={() => router.push('/dashboard/create')}
          >
            新建 Agent
          </Button>
          <Button
            h={10}
            variant={'whiteBase'}
            bg={'white'}
            border={'1px solid'}
            borderColor={omniTheme.colors.border}
            borderRadius={omniTheme.radii.md}
            color={omniTheme.colors.text}
            fontWeight={800}
            leftIcon={<MyIcon name={'common/importLight'} w={'14px'} />}
            _hover={{
              borderColor: omniTheme.colors.saturatedBlue,
              color: omniTheme.colors.saturatedBlue
            }}
            onClick={() => router.push('/dataset/list')}
          >
            导入知识库
          </Button>
        </Flex>
      )}

      <Box flex={1} minH={0} overflowY={'auto'} pr={isCollapsed ? 0 : 1}>
        {navGroups.map((group) => (
          <Box key={group.title} mb={isCollapsed ? 4 : 5}>
            {isCollapsed ? (
              <Box mx={'auto'} mb={2} w={8} h={'1px'} bg={omniTheme.colors.border} />
            ) : (
              <Box px={2} mb={2} fontSize={'12px'} fontWeight={800} color={omniTheme.colors.muted}>
                {group.title}
              </Box>
            )}
            <Flex flexDirection={'column'} alignItems={isCollapsed ? 'center' : 'stretch'} gap={1}>
              {group.items.map((item) => {
                const isActive = getIsActive(router.pathname, router.query, item);
                const isChildItem = !!item.depth;

                const itemNode = (
                  <Flex
                    alignItems={'center'}
                    justifyContent={isCollapsed ? 'center' : 'flex-start'}
                    gap={isCollapsed ? 0 : 3}
                    position={'relative'}
                    w={isCollapsed ? '40px' : '100%'}
                    minW={isCollapsed ? '40px' : undefined}
                    maxW={isCollapsed ? '40px' : undefined}
                    h={isCollapsed ? '40px' : isChildItem ? 9 : 10}
                    flexShrink={0}
                    ml={isCollapsed ? 0 : isChildItem ? 5 : 0}
                    px={isCollapsed ? 0 : isChildItem ? 2.5 : 3}
                    borderRadius={omniTheme.radii.md}
                    cursor={'pointer'}
                    border={'1px solid'}
                    transition={'all 0.16s ease'}
                    {...(isActive
                      ? {
                          bg: 'white',
                          color: omniTheme.colors.saturatedBlue,
                          borderColor: omniTheme.colors.border,
                          boxShadow: omniTheme.shadows.active
                        }
                      : {
                          bg: 'transparent',
                          color: isChildItem ? omniTheme.colors.muted : omniTheme.colors.text,
                          borderColor: 'transparent',
                          _hover: {
                            bg: 'white',
                            color: omniTheme.colors.saturatedBlue,
                            borderColor: omniTheme.colors.border
                          }
                        })}
                    onClick={() => navigate(item)}
                  >
                    <Flex
                      w={5}
                      h={5}
                      alignItems={'center'}
                      justifyContent={'center'}
                      flexShrink={0}
                    >
                      <MyIcon
                        name={
                          (isActive && item.activeIcon
                            ? item.activeIcon
                            : item.icon) as IconNameType
                        }
                        width={isCollapsed ? '18px' : isChildItem ? '16px' : '18px'}
                        height={isCollapsed ? '18px' : isChildItem ? '16px' : '18px'}
                        color={
                          isActive
                            ? omniTheme.colors.saturatedBlue
                            : isChildItem
                              ? omniTheme.colors.muted
                              : omniTheme.colors.text
                        }
                      />
                    </Flex>
                    {!isCollapsed && (
                      <Box
                        flex={1}
                        minW={0}
                        fontSize={'sm'}
                        fontWeight={isChildItem ? 700 : 800}
                        noOfLines={1}
                      >
                        {item.label}
                      </Box>
                    )}
                    {!!item.unread && (
                      <Box
                        position={isCollapsed ? 'absolute' : 'static'}
                        top={isCollapsed ? 1 : undefined}
                        right={isCollapsed ? 1 : undefined}
                      >
                        <Badge count={item.unread}>
                          <Box w={1} h={1} />
                        </Badge>
                      </Box>
                    )}
                  </Flex>
                );

                const itemKey = `${group.title}-${item.label}-${item.link}`;

                return isCollapsed ? (
                  <MyTooltip
                    key={itemKey}
                    label={item.label}
                    placement="right"
                    shouldWrapChildren={false}
                  >
                    {itemNode}
                  </MyTooltip>
                ) : (
                  <React.Fragment key={itemKey}>{itemNode}</React.Fragment>
                );
              })}
            </Flex>
          </Box>
        ))}

        {customNavbarItems.length > 0 && (
          <Box mb={5}>
            {isCollapsed ? (
              <Box mx={'auto'} mb={2} w={8} h={'1px'} bg={omniTheme.colors.border} />
            ) : (
              <Box px={2} mb={2} fontSize={'12px'} fontWeight={800} color={omniTheme.colors.muted}>
                更多
              </Box>
            )}
            <Flex flexDirection={'column'} alignItems={isCollapsed ? 'center' : 'stretch'} gap={1}>
              {customNavbarItems.map((item) => {
                const itemNode = (
                  <Link
                    as={NextLink}
                    href={item.url}
                    target={'_blank'}
                    h={10}
                    w={isCollapsed ? 11 : '100%'}
                    display={'flex'}
                    alignItems={'center'}
                    justifyContent={isCollapsed ? 'center' : 'flex-start'}
                    gap={isCollapsed ? 0 : 3}
                    px={isCollapsed ? 0 : 3}
                    borderRadius={omniTheme.radii.md}
                    color={omniTheme.colors.text}
                    fontSize={'sm'}
                    fontWeight={800}
                    _hover={{
                      bg: 'white',
                      color: omniTheme.colors.saturatedBlue,
                      textDecoration: 'none'
                    }}
                  >
                    <Avatar src={item.avatar} borderRadius={'md'} width={'20px'} height={'20px'} />
                    {!isCollapsed && <Box noOfLines={1}>{item.name}</Box>}
                  </Link>
                );

                return isCollapsed ? (
                  <MyTooltip key={item.id} label={item.name} placement="right">
                    {itemNode}
                  </MyTooltip>
                ) : (
                  <React.Fragment key={item.id}>{itemNode}</React.Fragment>
                );
              })}
            </Flex>
          </Box>
        )}
      </Box>

      {(() => {
        const userNode = (
          <Flex
            flex={'0 0 auto'}
            alignItems={'center'}
            justifyContent={isCollapsed ? 'center' : 'flex-start'}
            gap={isCollapsed ? 0 : 3}
            pt={3}
            mt={3}
            borderTop={'1px solid'}
            borderColor={omniTheme.colors.border}
            cursor={'pointer'}
            onClick={() => router.push('/account/info')}
          >
            <Avatar w={9} src={userInfo?.avatar} borderRadius={'50%'} />
            {!isCollapsed && (
              <Box minW={0}>
                <Box fontSize={'sm'} fontWeight={800} color={omniTheme.colors.text} noOfLines={1}>
                  {userInfo?.username || 'Admin'}
                </Box>
                <Box fontSize={'11px'} color={omniTheme.colors.muted} noOfLines={1}>
                  {userInfo?.username === 'root' ? 'System Admin' : 'Workspace Member'}
                </Box>
              </Box>
            )}
          </Flex>
        );

        return isCollapsed ? (
          <MyTooltip label={userInfo?.username || 'Admin'} placement="right">
            {userNode}
          </MyTooltip>
        ) : (
          userNode
        );
      })()}
      <LogoutConfirmModal />
    </Flex>
  );
};

export default Navbar;
