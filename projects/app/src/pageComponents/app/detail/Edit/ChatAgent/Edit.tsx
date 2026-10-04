import React, { useMemo, useState } from 'react';
import { Box } from '@chakra-ui/react';

import ChatTest from './ChatTest';
import AppCard from '../FormComponent/AppCard';
import EditForm from './EditForm';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type SimpleAppSnapshotType } from '../FormComponent/useSnapshots';
import { agentForm2AppWorkflow } from './utils';
import { useTranslation } from 'next-i18next';
import { agentConfigSectionIds, type AgentConfigSectionKey } from './configSections';
import ResizableAgentSplit from '../FormComponent/ResizableAgentSplit';
import AgentConfigWorkspace, { type AgentConfigTask } from '../FormComponent/AgentConfigWorkspace';
import { omniTheme } from '@/web/common/brand/theme';
import AgentWorkspace from './AgentWorkspace';
import { SandboxFilePanelProvider } from '@/pageComponents/chat/SandboxEditor/PanelContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';

const Edit = ({
  appForm,
  setAppForm,
  setPast
}: {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { chatId } = useChatStore();
  const appId = useContextSelector(AppContext, (value) => value.appDetail._id);
  const [renderEdit, setRenderEdit] = useState(true);

  const configSteps = useMemo<AgentConfigTask<AgentConfigSectionKey>[]>(
    () => [
      { key: 'overview', label: String(t('app:agent_config_identity')) },
      { key: 'dataset', label: String(t('app:agent_config_knowledge')) },
      { key: 'tools', label: String(t('app:agent_config_tools')) },
      { key: 'runtime', label: String(t('app:agent_config_runtime')) },
      { key: 'interaction', label: String(t('app:agent_config_interaction')) }
    ],
    [t]
  );

  const config = (
    <AgentConfigWorkspace
      tasks={configSteps}
      sectionIds={agentConfigSectionIds}
      onCollapse={() => setRenderEdit(false)}
    >
      <Box id={agentConfigSectionIds.overview} scrollMarginTop={'12px'}>
        <AppCard
          appForm={appForm}
          setPast={setPast}
          form2WorkflowFn={agentForm2AppWorkflow}
          configToWorkflow={false}
        />
        <Box
          px={[4, 5]}
          py={2}
          bg={omniTheme.colors.pageBg}
          borderBottom={'1px solid'}
          borderColor={omniTheme.colors.border}
          color={omniTheme.colors.muted}
          whiteSpace={'pre-wrap'}
          fontSize={omniTheme.typography.agentBody}
          lineHeight={1.6}
        >
          {t('app:chat_agent_beta_tip')}
        </Box>
      </Box>
      <EditForm appId={appId} appForm={appForm} setAppForm={setAppForm} />
    </AgentConfigWorkspace>
  );
  const chat = isPc ? (
    <Box h={'full'} minW={0}>
      <ChatTest
        appForm={appForm}
        setAppForm={setAppForm}
        showConfig={renderEdit}
        onToggleConfig={() => setRenderEdit((value) => !value)}
        form2WorkflowFn={agentForm2AppWorkflow}
      />
    </Box>
  ) : null;

  return (
    <SandboxFilePanelProvider scopeKey={`${appId}:${chatId}`}>
      {isPc ? (
        <AgentWorkspace config={config} chat={chat} showConfig={renderEdit} />
      ) : (
        <ResizableAgentSplit>{config}</ResizableAgentSplit>
      )}
    </SandboxFilePanelProvider>
  );
};

export default React.memo(Edit);
