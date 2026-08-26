import React, { useCallback, useEffect, useMemo, useTransition } from 'react';
import { Box, Flex, Grid, type BoxProps, useDisclosure, Button, Switch } from '@chakra-ui/react';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import VariableEdit from '@/components/core/app/VariableEdit';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { workflowSystemVariables } from '@/web/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../FormComponent/ToolSelector/ToolSelect';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIconButton, { MyDeleteIconButton } from '@fastgpt/web/components/common/Icon/button';
import SandboxTipTag from '../../components/SandboxTipTag';
import SandboxNotSupportTip from '../../components/SandboxNotSupportTip';
import { useUserStore } from '@/web/support/user/useUserStore';
import { simpleConfigSectionIds, type SimpleConfigSectionKey } from './configSections';
import { AgentParameterRow, AgentParameterSection } from '../FormComponent/AgentParameterSection';
import { omniTheme } from '@/web/common/brand/theme';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const TTSSelect = dynamic(() => import('@/components/core/app/TTSSelect'));
const QGConfig = dynamic(() => import('@/components/core/app/QGConfig'));
const WhisperConfig = dynamic(() => import('@/components/core/app/WhisperConfig'));
const InputGuideConfig = dynamic(() => import('@/components/core/app/InputGuideConfig'));
const WelcomeTextConfig = dynamic(() => import('@/components/core/app/WelcomeTextConfig'));
const FileSelectConfig = dynamic(() => import('@/components/core/app/FileSelect'));

const BoxStyles: BoxProps = {
  px: 0,
  py: 3,
  borderBottom: '1px solid',
  borderColor: omniTheme.colors.border,
  _last: {
    borderBottom: 0
  }
};

const ConfigSection = ({
  sectionKey,
  title,
  desc,
  onActiveSectionChange,
  children
}: {
  sectionKey: SimpleConfigSectionKey;
  title: React.ReactNode;
  desc?: React.ReactNode;
  onActiveSectionChange?: (key: SimpleConfigSectionKey) => void;
  children: React.ReactNode;
}) => {
  const chapter = {
    overview: '01',
    model: '01',
    dataset: '02',
    tools: '03',
    interaction: '04',
    runtime: '05'
  } satisfies Record<SimpleConfigSectionKey, string>;

  return (
    <AgentParameterSection
      id={simpleConfigSectionIds[sectionKey]}
      chapter={chapter[sectionKey]}
      title={title}
      description={desc}
      onMouseEnter={() => onActiveSectionChange?.(sectionKey)}
    >
      {children}
    </AgentParameterSection>
  );
};

const EditForm = ({
  appForm,
  setAppForm,
  onActiveSectionChange
}: {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  onActiveSectionChange?: (key: SimpleConfigSectionKey) => void;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { defaultModels, feConfigs } = useSystemStore();
  const showSandbox = feConfigs.show_agent_sandbox;
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const selectDatasets = useMemo(() => appForm?.dataset?.datasets, [appForm]);
  const [, startTst] = useTransition();

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();

  const formatVariables = useMemo(
    () =>
      formatEditorVariablePickerIcon([
        ...workflowSystemVariables.filter((variable) => !['histories'].includes(variable.key)),
        ...(appForm.chatConfig.variables || [])
      ]).map((item) => ({
        ...item,
        label: t(item.label as any),
        parent: {
          id: 'VARIABLE_NODE_ID',
          label: t('common:core.module.Variable'),
          avatar: 'core/workflow/template/variable'
        }
      })),
    [appForm.chatConfig.variables, t]
  );

  const selectedModel = getWebLLMModel(appForm.aiSettings.model);
  const tokenLimit = useMemo(() => {
    return selectedModel?.quoteMaxToken || 3000;
  }, [selectedModel?.quoteMaxToken]);

  // Force close image select when model not support vision
  useEffect(() => {
    if (!selectedModel.vision) {
      setAppForm((state) => ({
        ...state,
        chatConfig: {
          ...state.chatConfig,
          ...(state.chatConfig.fileSelectConfig
            ? {
                fileSelectConfig: {
                  ...state.chatConfig.fileSelectConfig,
                  canSelectImg: false
                }
              }
            : {})
        }
      }));
    }
  }, [selectedModel, setAppForm]);

  useEffect(() => {
    if (
      appForm.dataset.datasetSearchUsingExtensionQuery &&
      !appForm.dataset.datasetSearchExtensionModel
    ) {
      setAppForm((state) => ({
        ...state,
        dataset: {
          ...state.dataset,
          datasetSearchExtensionModel: defaultModels.llm?.model
        }
      }));
    }
  }, [
    appForm.dataset.datasetSearchUsingExtensionQuery,
    appForm.dataset.datasetSearchExtensionModel,
    defaultModels.llm?.model,
    setAppForm
  ]);

  const OptimizerPopverComponent = useCallback(
    ({ iconButtonStyle }: { iconButtonStyle: Record<string, any> }) => {
      return (
        <OptimizerPopover
          iconButtonStyle={iconButtonStyle}
          defaultPrompt={appForm.aiSettings.systemPrompt}
          onChangeText={(e) => {
            setAppForm((state) => ({
              ...state,
              aiSettings: {
                ...state.aiSettings,
                systemPrompt: e
              }
            }));
          }}
        />
      );
    },
    [appForm.aiSettings.systemPrompt, setAppForm]
  );

  return (
    <>
      <ConfigSection
        sectionKey="model"
        title={t('app:ai_settings')}
        desc={t('app:agent_config_model_desc')}
        onActiveSectionChange={onActiveSectionChange}
      >
        <AgentParameterRow
          label={t('common:core.ai.Model')}
          description={t('app:agent_config_model_field_desc')}
        >
          <SettingLLMModel
            bg={omniTheme.colors.pageBg}
            defaultData={{
              model: appForm.aiSettings.model,
              temperature: appForm.aiSettings.temperature,
              maxToken: appForm.aiSettings.maxToken,
              maxHistories: appForm.aiSettings.maxHistories,
              aiChatReasoning: appForm.aiSettings.aiChatReasoning ?? true,
              aiChatTopP: appForm.aiSettings.aiChatTopP,
              aiChatStopSign: appForm.aiSettings.aiChatStopSign,
              aiChatResponseFormat: appForm.aiSettings.aiChatResponseFormat,
              aiChatJsonSchema: appForm.aiSettings.aiChatJsonSchema,
              aiChatDefaultConfig: appForm.aiSettings.aiChatDefaultConfig
            }}
            onChange={({ maxHistories = 6, ...data }) => {
              setAppForm((state) => ({
                ...state,
                aiSettings: {
                  ...state.aiSettings,
                  ...data,
                  maxHistories
                }
              }));
            }}
          />
        </AgentParameterRow>

        <AgentParameterRow
          align={'start'}
          label={
            <Flex alignItems={'center'}>
              {t('common:core.ai.Prompt')}
              <QuestionTip ml={1} label={t('common:core.app.tip.systemPromptTip')} />
            </Flex>
          }
          description={t('app:agent_config_prompt_field_desc')}
        >
          <Box minW={0}>
            <PromptEditor
              minH={176}
              value={appForm.aiSettings.systemPrompt}
              bg={omniTheme.colors.pageBg}
              onChange={(text) => {
                startTst(() => {
                  setAppForm((state) => ({
                    ...state,
                    aiSettings: {
                      ...state.aiSettings,
                      systemPrompt: text
                    }
                  }));
                });
              }}
              variableLabels={formatVariables}
              variables={formatVariables}
              placeholder={t('common:core.app.tip.systemPromptTip')}
              title={t('common:core.ai.Prompt')}
              ExtensionPopover={[OptimizerPopverComponent]}
              isRichText={false}
            />
            <Flex mt={2} justifyContent={'flex-end'}>
              <VariableTip color={omniTheme.colors.muted} />
            </Flex>
          </Box>
        </AgentParameterRow>
      </ConfigSection>

      <ConfigSection
        sectionKey="dataset"
        title={t('app:dataset')}
        desc={t('app:agent_config_dataset_desc')}
        onActiveSectionChange={onActiveSectionChange}
      >
        <AgentParameterRow
          align={'start'}
          label={t('app:dataset')}
          description={t('app:agent_config_dataset_field_desc')}
          action={
            <Flex gap={1}>
              <Button
                variant={'transparentBase'}
                leftIcon={<MyIcon name={'edit'} w={'14px'} />}
                iconSpacing={1}
                size={'sm'}
                fontSize={'sm'}
                onClick={onOpenDatasetParams}
              >
                {t('common:Params')}
              </Button>
              <Button
                variant={'transparentBase'}
                leftIcon={<MyIcon name={'common/addLight'} w={'14px'} />}
                iconSpacing={1}
                size={'sm'}
                fontSize={'sm'}
                onClick={onOpenDatasetSelect}
              >
                {t('common:Choose')}
              </Button>
            </Flex>
          }
        >
          <Box minW={0}>
            {appForm.dataset.datasets?.length > 0 && (
              <Box mb={3}>
                <SearchParamsTip
                  searchMode={appForm.dataset.searchMode}
                  similarity={appForm.dataset.similarity}
                  limit={appForm.dataset.limit}
                  usingReRank={appForm.dataset.usingReRank}
                  usingExtensionQuery={appForm.dataset.datasetSearchUsingExtensionQuery}
                  queryExtensionModel={appForm.dataset.datasetSearchExtensionModel}
                />
              </Box>
            )}
            {appForm.dataset.datasets?.length === 0 && (
              <Box color={omniTheme.colors.muted} fontSize={'12px'}>
                {t('app:No_selected_dataset')}
              </Box>
            )}
            <Grid
              gridTemplateColumns={'minmax(0, 1fr)'}
              borderTop={appForm.dataset.datasets?.length > 0 ? '1px solid' : 0}
              borderColor={omniTheme.colors.border}
            >
              {selectDatasets.map((item) => (
                <Flex
                  key={item.datasetId}
                  overflow={'hidden'}
                  alignItems={'center'}
                  minH={'42px'}
                  px={1}
                  py={2}
                  bg={omniTheme.colors.surface}
                  borderBottom={'1px solid'}
                  borderColor={omniTheme.colors.border}
                  transition={'background-color .18s ease'}
                  _hover={{
                    bg: omniTheme.colors.pageBg,
                    '& .controler': {
                      display: 'flex'
                    }
                  }}
                >
                  <Avatar src={item.avatar} w={'1.5rem'} borderRadius={omniTheme.radii.sm} />
                  <Box
                    ml={2}
                    flex={'1 0 0'}
                    w={0}
                    className={'textEllipsis'}
                    fontSize={'sm'}
                    color={'myGray.900'}
                  >
                    {item.name}
                  </Box>

                  {/* Icon */}
                  <Box className="controler" display={['flex', 'none']} alignItems={'center'}>
                    <MyIconButton
                      icon={'common/viewLight'}
                      onClick={() =>
                        router.push({
                          pathname: '/dataset/detail',
                          query: {
                            datasetId: item.datasetId
                          }
                        })
                      }
                    />
                    <MyDeleteIconButton
                      onClick={() => {
                        setAppForm((state) => ({
                          ...state,
                          dataset: {
                            ...state.dataset,
                            datasets:
                              state.dataset.datasets?.filter(
                                (pre) => pre.datasetId !== item.datasetId
                              ) || []
                          }
                        }));
                      }}
                    />
                  </Box>
                </Flex>
              ))}
            </Grid>
          </Box>
        </AgentParameterRow>
      </ConfigSection>

      <ConfigSection
        sectionKey="tools"
        title={t('app:agent_config_tools')}
        desc={t('app:agent_config_legacy_tools_desc')}
        onActiveSectionChange={onActiveSectionChange}
      >
        <Box {...BoxStyles}>
          <ToolSelect
            selectedModel={selectedModel}
            selectedTools={appForm.selectedTools}
            fileSelectConfig={appForm.chatConfig.fileSelectConfig}
            onAddTool={(e) => {
              setAppForm((state) => ({
                ...state,
                selectedTools: [e, ...(state.selectedTools || [])]
              }));
            }}
            onUpdateTool={(e) => {
              setAppForm((state) => ({
                ...state,
                selectedTools:
                  state.selectedTools?.map((item) => (item.id === e.id ? e : item)) || []
              }));
            }}
            onRemoveTool={(id) => {
              setAppForm((state) => ({
                ...state,
                selectedTools: state.selectedTools?.filter((item) => item.pluginId !== id) || []
              }));
            }}
          />
        </Box>
      </ConfigSection>

      <ConfigSection
        sectionKey="interaction"
        title={t('app:agent_config_interaction')}
        desc={t('app:agent_config_legacy_interaction_desc')}
        onActiveSectionChange={onActiveSectionChange}
      >
        <Box {...BoxStyles}>
          <FileSelectConfig
            forbidVision={!selectedModel?.vision}
            value={appForm.chatConfig.fileSelectConfig}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  fileSelectConfig: e
                }
              }));
            }}
          />
        </Box>

        {/* variable */}
        <Box {...BoxStyles}>
          <VariableEdit
            variables={appForm.chatConfig.variables}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  variables: e
                }
              }));
            }}
          />
        </Box>

        {/* welcome */}
        <Box {...BoxStyles}>
          <WelcomeTextConfig
            value={appForm.chatConfig.welcomeText}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  welcomeText: e.target.value
                }
              }));
            }}
          />
        </Box>

        {/* tts */}
        <Box {...BoxStyles}>
          <TTSSelect
            value={appForm.chatConfig.ttsConfig}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  ttsConfig: e
                }
              }));
            }}
          />
        </Box>

        {/* whisper */}
        <Box {...BoxStyles}>
          <WhisperConfig
            isOpenAudio={appForm.chatConfig.ttsConfig?.type !== TTSTypeEnum.none}
            value={appForm.chatConfig.whisperConfig}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  whisperConfig: e
                }
              }));
            }}
          />
        </Box>

        {/* question guide */}
        <Box {...BoxStyles}>
          <QGConfig
            value={appForm.chatConfig.questionGuide}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  questionGuide: e
                }
              }));
            }}
          />
        </Box>

        {/* question tips */}
        <Box {...BoxStyles}>
          <InputGuideConfig
            appId={appDetail._id}
            value={appForm.chatConfig.chatInputGuide}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                chatConfig: {
                  ...state.chatConfig,
                  chatInputGuide: e
                }
              }));
            }}
          />
        </Box>
      </ConfigSection>

      <ConfigSection
        sectionKey="runtime"
        title={t('app:agent_config_runtime')}
        desc={t('app:agent_config_runtime_desc')}
        onActiveSectionChange={onActiveSectionChange}
      >
        <AgentParameterRow
          label={
            <Flex alignItems={'center'}>
              {t('app:use_agent_sandbox')}
              <QuestionTip ml={1} label={t('app:use_computer_desc')} />
            </Flex>
          }
          description={t('app:agent_config_runtime_field_desc')}
        >
          <Flex alignItems={'center'} justifyContent={'flex-end'}>
            {showSandbox ? (
              enableSandbox ? (
                <>
                  <Box mr={2}>
                    <SandboxTipTag />
                  </Box>
                  <Switch
                    isChecked={appForm.aiSettings.useAgentSandbox ?? false}
                    onChange={(e) => {
                      setAppForm((state) => ({
                        ...state,
                        aiSettings: {
                          ...state.aiSettings,
                          useAgentSandbox: e.target.checked
                        }
                      }));
                    }}
                  />
                </>
              ) : (
                <SandboxNotSupportTip type="freeDisable" />
              )
            ) : (
              <SandboxNotSupportTip type="systemDisable" />
            )}
          </Flex>
        </AgentParameterRow>
      </ConfigSection>

      {isOpenDatasetSelect && (
        <DatasetSelectModal
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item.datasetId,
            name: item.name,
            avatar: item.avatar,
            vectorModel: item.vectorModel
          }))}
          onClose={onCloseDatasetSelect}
          onChange={(e) => {
            setAppForm((state) => ({
              ...state,
              dataset: {
                ...state.dataset,
                datasets: e
              }
            }));
          }}
        />
      )}
      {isOpenDatasetParams && (
        <DatasetParamsModal
          {...appForm.dataset}
          maxTokens={tokenLimit}
          onClose={onCloseDatasetParams}
          onSuccess={(e) => {
            setAppForm((state) => ({
              ...state,
              dataset: {
                ...state.dataset,
                ...e
              }
            }));
          }}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);
