import React, { useMemo, useState } from 'react';
import { Box } from '@chakra-ui/react';

import AppCard from '../FormComponent/AppCard';
import EditForm from './EditForm';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';

import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type SimpleAppSnapshotType } from '../FormComponent/useSnapshots';
import ChatTest from './ChatTest';
import { form2AppWorkflow } from './utils';
import { useTranslation } from 'next-i18next';
import { simpleConfigSectionIds, type SimpleConfigSectionKey } from './configSections';
import ResizableAgentSplit from '../FormComponent/ResizableAgentSplit';
import AgentConfigWorkspace, { type AgentConfigTask } from '../FormComponent/AgentConfigWorkspace';
import AgentWorkspace from '../ChatAgent/AgentWorkspace';
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

  const configSteps = useMemo<AgentConfigTask<SimpleConfigSectionKey>[]>(
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
      sectionIds={simpleConfigSectionIds}
      onCollapse={() => setRenderEdit(false)}
    >
      <Box id={simpleConfigSectionIds.overview} scrollMarginTop={'12px'}>
        <AppCard appForm={appForm} setPast={setPast} form2WorkflowFn={form2AppWorkflow} />
      </Box>
      <EditForm appForm={appForm} setAppForm={setAppForm} />
    </AgentConfigWorkspace>
  );
  const chat = isPc ? (
    <Box h={'full'} minW={0}>
      <ChatTest
        appForm={appForm}
        setRenderEdit={setRenderEdit}
        showConfig={renderEdit}
        onToggleConfig={() => setRenderEdit((value) => !value)}
        form2WorkflowFn={form2AppWorkflow}
      />
    </Box>
  ) : null;

  return isPc ? (
    <SandboxFilePanelProvider scopeKey={`${appId}:${chatId}`}>
      <AgentWorkspace config={config} chat={chat} showConfig={renderEdit} />
    </SandboxFilePanelProvider>
  ) : (
    <ResizableAgentSplit>{config}</ResizableAgentSplit>
  );
};

export default React.memo(Edit);
