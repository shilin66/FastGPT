import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatHttpError } from '../utils';
import { codeSandbox } from '../../../../thirdProvider/codeSandbox';

type RunCodeType = ModuleDispatchProps<{
  [NodeInputKeyEnum.codeType]: 'python3' | 'js';
  [NodeInputKeyEnum.code]: string;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
}>;
type RunCodeResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.rawResponse]?: Record<string, any>;
    [key: string]: any;

    /** @deprecated */
    [NodeOutputKeyEnum.error]?: any;
  },
  {
    [NodeOutputKeyEnum.error]: object;
  }
>;

export const dispatchCodeSandbox = async (props: RunCodeType): Promise<RunCodeResponse> => {
  const {
    node: { catchError },
    params: { codeType, code, [NodeInputKeyEnum.addInputParam]: customVariables }
  } = props;

  if (!process.env.CODE_SANDBOX_URL) {
    return {
      data: undefined,
      error: {
        [NodeOutputKeyEnum.error]: { message: 'Can not find CODE_SANDBOX_URL in env' }
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: 'Can not find CODE_SANDBOX_URL in env',
        customInputs: customVariables
      }
    };
  }

  try {
    const { codeReturn, log } = await codeSandbox.runCode({
      codeType,
      code,
      variables: customVariables
    });

    return {
      data: {
        [NodeOutputKeyEnum.rawResponse]: codeReturn,
        ...codeReturn
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        customInputs: customVariables,
        customOutputs: codeReturn,
        codeLog: log
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: codeReturn
    };
  } catch (error) {
    const text = getErrText(error, 'Request code sandbox failed');

    // @adapt
    if (catchError === undefined) {
      return {
        data: {
          [NodeOutputKeyEnum.error]: formatHttpError(error)
        },
        error: undefined,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: customVariables,
          errorText: text
        }
      };
    }

    return {
      data: undefined,
      error: {
        [NodeOutputKeyEnum.error]: formatHttpError(error)
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        customInputs: customVariables,
        errorText: text
      }
    };
  }
};
