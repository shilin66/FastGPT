import { Button, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { Box } from '@chakra-ui/react';
import { childAppSystemKey } from '../FormComponent/ToolSelector/ToolSelectModal';
import { Controller, useForm } from 'react-hook-form';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import SecretInputModal, {
  type ToolParamsFormType
} from '@/pageComponents/app/tool/SecretInputModal';
import { SystemToolSecretInputTypeMap } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { useBoolean } from 'ahooks';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import {
  OmniInfoCallout,
  OmniModalBody,
  OmniModalFooter,
  OmniModalSection
} from '../../components/OmniModalLayout';

const ConfigToolModal = ({
  configTool,
  onCloseConfigTool,
  onAddTool
}: {
  configTool: FlowNodeTemplateType;
  onCloseConfigTool: () => void;
  onAddTool: (tool: FlowNodeTemplateType) => void;
}) => {
  const { t } = useSafeTranslation();
  const [isOpenSecretModal, { setTrue: setTrueSecretModal, setFalse: setFalseSecretModal }] =
    useBoolean(false);

  const { handleSubmit, control } = useForm({
    defaultValues: configTool
      ? configTool.inputs.reduce(
          (acc, input) => {
            acc[input.key] = input.value || input.defaultValue;
            return acc;
          },
          {} as Record<string, any>
        )
      : {}
  });

  return (
    <MyModal
      isOpen
      isCentered
      title={t('app:tool_param_config')}
      iconSrc="core/app/toolCall"
      overflow={'auto'}
      maxW={['92vw', '820px']}
      w={'100%'}
    >
      <OmniModalBody
        icon="core/app/toolCall"
        title={configTool?.name || t('app:tool_param_config')}
        desc={t('app:tool_input_param_tip')}
        asideItems={[
          {
            label: t('app:tool_param_config'),
            desc: t('app:tool_input_param_tip'),
            icon: 'common/setting'
          },
          {
            label: t('common:Confirm'),
            desc: t('common:Confirm'),
            icon: 'common/check'
          }
        ]}
      >
        <OmniModalSection
          title={t('app:tool_param_config')}
          desc={configTool?.name}
          action={
            !!(configTool?.courseUrl || configTool?.userGuide) && (
              <UseGuideModal
                title={configTool?.name}
                iconSrc={configTool?.avatar}
                text={configTool?.userGuide}
                link={configTool?.courseUrl}
              >
                {({ onClick }) => (
                  <Button size={'sm'} variant={'whiteBase'} onClick={onClick}>
                    {t('app:workflow.Input guide')}
                  </Button>
                )}
              </UseGuideModal>
            )
          }
        >
          <OmniInfoCallout>{t('app:tool_input_param_tip')}</OmniInfoCallout>
          {configTool.inputs
            .filter(
              (input) =>
                !input.toolDescription &&
                !childAppSystemKey.includes(input.key) &&
                !input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) &&
                !input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
            )
            .map((input) => {
              return (
                <Box key={input.key} _notLast={{ mb: 4 }}>
                  <Flex alignItems={'center'} mb={1.5}>
                    {input.required && <Box color={'red.500'}>*</Box>}
                    <FormLabel color={'#1E293B'} fontWeight={700}>
                      {t(input.label)}
                    </FormLabel>
                    {input.description && <QuestionTip ml={1} label={t(input.description)} />}
                  </Flex>

                  {input.key === NodeInputKeyEnum.systemInputConfig && input.inputList ? (
                    <Controller
                      control={control}
                      name={input.key}
                      rules={{
                        required: true
                      }}
                      render={({ field: { onChange, value }, fieldState: { error } }) => (
                        <Box>
                          <Button
                            variant={'whiteBase'}
                            border={'1px solid'}
                            borderColor={error ? 'red.500' : 'rgba(37, 99, 235, 0.16)'}
                            borderRadius={'10px'}
                            leftIcon={
                              <Box w={'6px'} h={'6px'} bg={'#2563EB'} borderRadius={'md'} />
                            }
                            onClick={setTrueSecretModal}
                          >
                            {(() => {
                              const val = value as ToolParamsFormType;
                              if (!val) {
                                return t('workflow:tool_active_config');
                              }

                              return t('workflow:tool_active_config_type', {
                                type: t(SystemToolSecretInputTypeMap[val.type]?.text as any)
                              });
                            })()}
                          </Button>

                          {isOpenSecretModal && (
                            <SecretInputModal
                              isFolder={configTool?.isFolder}
                              inputConfig={{
                                ...input,
                                value: value as ToolParamsFormType
                              }}
                              hasSystemSecret={configTool?.hasSystemSecret}
                              secretCost={configTool?.systemKeyCost}
                              courseUrl={configTool?.courseUrl}
                              parentId={configTool?.pluginId}
                              onClose={setFalseSecretModal}
                              onSubmit={(data) => {
                                onChange(data);
                                setFalseSecretModal();
                              }}
                            />
                          )}
                        </Box>
                      )}
                    />
                  ) : (
                    <Controller
                      control={control}
                      name={input.key}
                      rules={{
                        validate: (value) => {
                          if (
                            input.valueType === WorkflowIOValueTypeEnum.boolean ||
                            input.valueType === WorkflowIOValueTypeEnum.number
                          ) {
                            return true;
                          }
                          if (!input.required) return true;

                          return !!value;
                        }
                      }}
                      render={({ field: { onChange, value }, fieldState: { error } }) => {
                        return (
                          <InputRender
                            {...input}
                            isRichText={false}
                            isInvalid={!!error}
                            inputType={nodeInputTypeToInputType(input.renderTypeList)}
                            value={value}
                            onChange={onChange}
                          />
                        );
                      }}
                    />
                  )}
                </Box>
              );
            })}
        </OmniModalSection>
      </OmniModalBody>
      <OmniModalFooter>
        <Button onClick={onCloseConfigTool} variant={'whiteBase'}>
          {t('common:Cancel')}
        </Button>
        <Button
          variant={'primary'}
          onClick={handleSubmit((data) => {
            onAddTool({
              ...configTool,
              inputs: configTool.inputs.map((input) => ({
                ...input,
                value: data[input.key] ?? input.value
              }))
            });
            onCloseConfigTool();
          })}
        >
          {t('common:Confirm')}
        </Button>
      </OmniModalFooter>
    </MyModal>
  );
};

export default React.memo(ConfigToolModal);
