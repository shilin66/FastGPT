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

  const configSteps = useMemo<AgentConfigTask<SimpleConfigSectionKey>[]>(
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
      {renderEdit && (
        <AgentConfigWorkspace tasks={configSteps} sectionIds={simpleConfigSectionIds}>
          <Box id={simpleConfigSectionIds.overview} scrollMarginTop={'12px'}>
            <AppCard appForm={appForm} setPast={setPast} form2WorkflowFn={form2AppWorkflow} />
          </Box>
          <EditForm appForm={appForm} setAppForm={setAppForm} />
        </AgentConfigWorkspace>
      )}
      {isPc && (
        <Box h={'full'} minW={0}>
          <ChatTest
            appForm={appForm}
            setRenderEdit={setRenderEdit}
            form2WorkflowFn={form2AppWorkflow}
          />
        </Box>
      )}
    </ResizableAgentSplit>
  );
};

export default React.memo(Edit);
