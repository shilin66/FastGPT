import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatHttpError } from '../utils';
import { codeSandbox } from '../../../../thirdProvider/codeSandbox';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.CODE_SANDBOX);

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
    node,
    params: { codeType, code, [NodeInputKeyEnum.addInputParam]: customVariables },
    workflowRunId,
    responseChatItemId,
    chatId,
    runningAppInfo
  } = props;
  const { catchError } = node;
  const requestId = getNanoid();
  const correlationId = workflowRunId ?? responseChatItemId ?? chatId;
  const startedAt = Date.now();
  const logContext = {
    workflowRunId: correlationId,
    requestId,
    appId: runningAppInfo.id,
    chatId,
    nodeId: node.nodeId,
    nodeType: node.flowNodeType,
    language: codeType,
    codeBytes: Buffer.byteLength(code, 'utf8'),
    inputCount: Object.keys(customVariables ?? {}).length
  };

  if (!process.env.CODE_SANDBOX_URL) {
    logger.error('workflow.code_sandbox.request.failed', {
      ...logContext,
      durationMs: Date.now() - startedAt,
      error: 'CODE_SANDBOX_URL is not configured'
    });
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
    logger.info('workflow.code_sandbox.request.start', logContext);

    const { codeReturn, log } = await codeSandbox.runCode({
      codeType,
      code,
      variables: customVariables,
      requestId
    });

    logger.info('workflow.code_sandbox.request.complete', {
      ...logContext,
      durationMs: Date.now() - startedAt,
      outputCount: codeReturn == null ? 0 : Object.keys(codeReturn).length
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
    logger.error('workflow.code_sandbox.request.failed', {
      ...logContext,
      durationMs: Date.now() - startedAt,
      error: text
    });

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
