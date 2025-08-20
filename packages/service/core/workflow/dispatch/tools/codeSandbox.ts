import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import { SandBoxTypeEnum } from '@fastgpt/global/common/system/types/index.d';
import { transformerNodejs, transformerPython3 } from './difySandBoxUtil';
import { formatHttpError } from '../utils';

type RunCodeType = ModuleDispatchProps<{
  [NodeInputKeyEnum.codeType]: 'python3' | 'js';
  [NodeInputKeyEnum.code]: string;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
}>;
type RunCodeResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.error]?: any; // @deprecated
    [NodeOutputKeyEnum.rawResponse]?: Record<string, any>;
    [key: string]: any;
  },
  {
    [NodeOutputKeyEnum.error]: object;
  }
>;

function getURL(codeType: string): string {
  if (codeType == SandboxCodeTypeEnum.py) {
    return `${process.env.SANDBOX_URL}/sandbox/python`;
  } else {
    return `${process.env.SANDBOX_URL}/sandbox/js`;
  }
}

export const dispatchCodeSandbox = async (props: RunCodeType): Promise<RunCodeResponse> => {
  const {
    node: { catchError },
    params: { codeType, code, [NodeInputKeyEnum.addInputParam]: customVariables }
  } = props;

  const sandBoxType = global.systemEnv.sandBoxType;
  if (sandBoxType && sandBoxType[codeType] === SandBoxTypeEnum.dify) {
    return callDifySandBox(code, customVariables, codeType, catchError);
  } else if (sandBoxType && sandBoxType[codeType] === SandBoxTypeEnum.fastgpt) {
    return callFastGptSandBox(code, customVariables, codeType, catchError);
  } else {
    throw new Error('Unsupported sandbox type');
  }
};

const callDifySandBox = async (
  code: string,
  variables: Record<string, any>,
  codeType: 'python3' | 'js',
  catchError?: boolean
) => {
  if (!global.systemEnv.difySandBoxUrl) {
    throw new Error('Can not find difySandBoxUrl in env');
  }
  if (!global.systemEnv.difySandBoxApiKey) {
    throw new Error('Can not find difySandBoxApiKey in env');
  }
  let runCode: string;
  let language: string;
  switch (codeType) {
    case SandboxCodeTypeEnum.py:
      runCode = transformerPython3(code, variables);
      language = 'python3';
      break;
    case SandboxCodeTypeEnum.js:
      runCode = transformerNodejs(code, variables);
      language = 'nodejs';
      break;
    default:
      throw new Error('Unsupported language');
  }

  try {
    const { data: runResult } = await axios.post<{
      code: number;
      message: string;
      data: {
        stdout: string;
        error: string;
      };
    }>(
      global.systemEnv.difySandBoxUrl + '/v1/sandbox/run',
      {
        code: runCode,
        language: language,
        enable_network: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': global.systemEnv.difySandBoxApiKey
        }
      }
    );

    if (runResult.code === 0 && runResult.data.error === '') {
      const regex = /<<RESULT>>([\s\S]*?)<<RESULT>>/;
      const match = runResult.data.stdout.match(regex);
      if (match && match[1]) {
        const result = JSON.parse(match[1]);
        const log = runResult.data.stdout.replace(regex, '').trimEnd();
        return {
          data: {
            [NodeOutputKeyEnum.rawResponse]: result,
            ...result
          },
          error: undefined,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            customInputs: variables,
            customOutputs: result,
            codeLog: log
          },
          [DispatchNodeResponseKeyEnum.toolResponses]: result
        };
      } else {
        throw new Error('Run code failed');
      }
    } else {
      return {
        data: undefined,
        error: {
          [NodeOutputKeyEnum.error]: runResult
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: variables,
          errorText: runResult
        }
      };
    }
  } catch (error) {
    // const text = getErrText(error);
    const text = formatHttpError(error);
    // @adapt
    if (catchError === undefined) {
      return {
        data: {
          [NodeOutputKeyEnum.error]: formatHttpError(error)
        },
        error: undefined,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: variables,
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
        customInputs: variables,
        errorText: text
      }
    };
  }
};

const callFastGptSandBox = async (
  code: string,
  variables: Record<string, any>,
  codeType: 'python3' | 'js',
  catchError?: boolean
) => {
  if (!process.env.SANDBOX_URL) {
    return {
      data: undefined,
      error: {
        [NodeOutputKeyEnum.error]: { message: 'Can not find SANDBOX_URL in env' }
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: 'Can not find SANDBOX_URL in env',
        customInputs: variables
      }
    };
  }

  const sandBoxRequestUrl = getURL(codeType);
  try {
    const { data: runResult } = await axios.post<{
      success: boolean;
      data: {
        codeReturn: Record<string, any>;
        log: string;
      };
    }>(sandBoxRequestUrl, {
      code,
      variables
    });

    if (runResult.success) {
      return {
        data: {
          [NodeOutputKeyEnum.rawResponse]: runResult.data.codeReturn,
          ...runResult.data.codeReturn
        },
        error: undefined,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: variables,
          customOutputs: runResult.data.codeReturn,
          codeLog: runResult.data.log
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: runResult.data.codeReturn
      };
    } else {
      throw new Error('Run code failed');
    }
  } catch (error) {
    const text = formatHttpError(error);

    // @adapt
    if (catchError === undefined) {
      return {
        data: {
          [NodeOutputKeyEnum.error]: formatHttpError(error)
        },
        error: undefined,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          customInputs: variables,
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
        customInputs: variables,
        errorText: text
      }
    };
  }
};
