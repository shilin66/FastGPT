import React, { useEffect, useMemo } from 'react';
import { Box, Flex, Grid, type BoxProps, useDisclosure, Button, Switch } from '@chakra-ui/react';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelect from '../FormComponent/ToolSelector/ToolSelect';
import SkillSelect from '../FormComponent/ToolSelector/SkillSelect';
import MyIconButton, { MyDeleteIconButton } from '@fastgpt/web/components/common/Icon/button';
import { useSkillManager } from './hooks/useSkillManager';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import SandboxTipTag from '../../components/SandboxTipTag';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SandboxNotSupportTip from '../../components/SandboxNotSupportTip';
import { useUserStore } from '@/web/support/user/useUserStore';
import { agentConfigSectionIds, type AgentConfigSectionKey } from './configSections';
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
  sectionKey: AgentConfigSectionKey;
  title: React.ReactNode;
  desc?: React.ReactNode;
  onActiveSectionChange?: (key: AgentConfigSectionKey) => void;
  children: React.ReactNode;
}) => {
  const chapter = {
    overview: '01',
    model: '01',
    dataset: '02',
    tools: '03',
    interaction: '04',
    runtime: '05'
  } satisfies Record<AgentConfigSectionKey, string>;

  return (
    <AgentParameterSection
      id={agentConfigSectionIds[sectionKey]}
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
  onActiveSectionChange?: (key: AgentConfigSectionKey) => void;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;

  const selectDatasets = useMemo(() => appForm?.dataset?.datasets, [appForm]);

  const { skillOption, selectedSkills, onClickSkill, onRemoveSkill, SkillModal } = useSkillManager({
    selectedTools: appForm.selectedTools,
    onDeleteTool: (id) => {
      setAppForm((state) => ({
        ...state,
        selectedTools: state.selectedTools?.filter((item) => item.id !== id) || []
      }));
    },
    onUpdateOrAddTool: (tool) => {
      setAppForm((state) => {
        const index = state.selectedTools.findIndex((item) => item.id === tool.id);

        if (index === -1) {
          return {
            ...state,
            selectedTools: [tool, ...(state.selectedTools || [])]
          };
        } else {
          return {
            ...state,
            selectedTools:
              state.selectedTools?.map((item) => (item.id === tool.id ? tool : item)) || []
          };
        }
      });
    },
    canUploadFile: !!(
      appForm.chatConfig.fileSelectConfig?.canSelectFile ||
      appForm.chatConfig.fileSelectConfig?.canSelectImg ||
      appForm.chatConfig.fileSelectConfig?.canSelectVideo ||
      appForm.chatConfig.fileSelectConfig?.canSelectAudio ||
      appForm.chatConfig.fileSelectConfig?.canSelectCustomFileExtension
    ),
    hasSelectedDataset: (appForm.dataset.datasets?.length || 0) > 0,
    useAgentSandbox: !!appForm.aiSettings.useAgentSandbox
  });

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();

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
              model: appForm.aiSettings.model
            }}
            showMaxToken={false}
            showTemperature={false}
            showTopP={false}
            showStopSign={false}
            showResponseFormat={false}
            showReasoning={false}
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
          label={t('common:core.ai.Prompt')}
          description={t('app:agent_config_prompt_field_desc')}
        >
          <PromptEditor
            minH={176}
            bg={omniTheme.colors.pageBg}
            title={t('common:core.ai.Prompt')}
            isRichText={false}
            skillOption={skillOption}
            selectedSkills={selectedSkills}
            onClickSkill={onClickSkill}
            onRemoveSkill={onRemoveSkill}
            value={appForm.aiSettings.systemPrompt}
            onChange={(e) => {
              setAppForm((state) => ({
                ...state,
                aiSettings: {
                  ...state.aiSettings,
                  systemPrompt: e
                }
              }));
            }}
          />
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
                onClick={onOpenKbSelect}
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
        desc={t('app:agent_config_tools_desc')}
        onActiveSectionChange={onActiveSectionChange}
      >
        {feConfigs?.show_skill && (
          <Box {...BoxStyles}>
            <SkillSelect
              selectedSkills={appForm.selectedAgentSkills || []}
              onAddSkill={(skill) => {
                setAppForm((state) => ({
                  ...state,
                  selectedAgentSkills: [skill, ...(state.selectedAgentSkills || [])]
                }));
              }}
              onRemoveSkill={(skillId) => {
                setAppForm((state) => ({
                  ...state,
                  selectedAgentSkills:
                    state.selectedAgentSkills?.filter((item) => item.skillId !== skillId) || []
                }));
              }}
            />
          </Box>
        )}

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
        desc={t('app:agent_config_interaction_desc')}
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
        {/* <Box {...BoxStyles}>
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
        </Box> */}

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
        {/* <Box {...BoxStyles}>
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
        </Box> */}

        {/* question tips */}
        {/* <Box {...BoxStyles}>
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
        </Box> */}
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
          onClose={onCloseKbSelect}
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
      <SkillModal />
    </>
  );
};

export default React.memo(EditForm);
