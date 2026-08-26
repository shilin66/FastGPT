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
  const [renderEdit, setRenderEdit] = useState(true);

  const configSteps = useMemo<AgentConfigTask<AgentConfigSectionKey>[]>(
    () => [
      { key: 'overview', label: String(t('app:agent_config_identity')) },
      { key: 'dataset', label: String(t('app:agent_config_knowledge')) },
      { key: 'tools', label: String(t('app:agent_config_tools')) },
      { key: 'interaction', label: String(t('app:agent_config_interaction')) },
      { key: 'runtime', label: String(t('app:agent_config_runtime')) }
    ],
    [t]
  );

  return (
    <ResizableAgentSplit showConfig={renderEdit}>
      {/* Top agent editor */}
      {renderEdit && (
        <AgentConfigWorkspace tasks={configSteps} sectionIds={agentConfigSectionIds}>
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
          <EditForm appForm={appForm} setAppForm={setAppForm} />
        </AgentConfigWorkspace>
      )}
      {isPc && (
        <Box h={'full'} minW={0}>
          <ChatTest
            appForm={appForm}
            setAppForm={setAppForm}
            setRenderEdit={setRenderEdit}
            form2WorkflowFn={agentForm2AppWorkflow}
          />
        </Box>
      )}
    </ResizableAgentSplit>
  );
};

export default React.memo(Edit);
