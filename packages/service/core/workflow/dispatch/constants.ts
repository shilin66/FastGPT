import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchWorkflowStart } from './init/workflowStart';
import { dispatchAnswer } from './tools/answer';
import { dispatchChatCompletion } from './chat/oneapi';
import { dispatchDatasetSearch } from './dataset/search';
import { dispatchDatasetConcat } from './dataset/concat';
import { dispatchClassifyQuestion } from './agent/classifyQuestion';
import { dispatchContentExtract } from './agent/extract';
import { dispatchHttp468Request } from './tools/http468';
import { dispatchRunAppNode } from './plugin/runApp';
import { dispatchRunPlugin } from './plugin/run';
import { dispatchPluginInput } from './plugin/runInput';
import { dispatchPluginOutput } from './plugin/runOutput';
import { dispatchQueryExtension } from './tools/queryExternsion';
import { dispatchRunTools } from './agent/runTool';
import { dispatchStopToolCall } from './agent/runTool/stopTool';
import { dispatchToolParams } from './agent/runTool/toolParams';
import { dispatchLafRequest } from './tools/runLaf';
import { dispatchIfElse } from './tools/runIfElse';
import { dispatchUpdateVariable } from './tools/runUpdateVar';
import { dispatchRunCode } from './code/run';
import { dispatchTextEditor } from './tools/textEditor';
import { dispatchCustomFeedback } from './tools/customFeedback';
import { dispatchReadFiles } from './tools/readFiles';
import { dispatchUserSelect } from './interactive/userSelect';
import { dispatchLoop } from './loop/runLoop';
import { dispatchLoopStart } from './loop/runLoopStart';
import { dispatchLoopEnd } from './loop/runLoopEnd';
import { dispatchFormInput } from './interactive/formInput';
import { dispatchRunTool } from './plugin/runTool';
import { dispatchSystemConfig } from './init/systemConfig';
import { dispatchAppRequest } from './abandoned/runApp';

export const callbackMap: Record<FlowNodeTypeEnum, Function> = {
  [FlowNodeTypeEnum.workflowStart]: dispatchWorkflowStart,
  [FlowNodeTypeEnum.answerNode]: dispatchAnswer,
  [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,
  [FlowNodeTypeEnum.datasetSearchNode]: dispatchDatasetSearch,
  [FlowNodeTypeEnum.datasetConcatNode]: dispatchDatasetConcat,
  [FlowNodeTypeEnum.classifyQuestion]: dispatchClassifyQuestion,
  [FlowNodeTypeEnum.contentExtract]: dispatchContentExtract,
  [FlowNodeTypeEnum.httpRequest468]: dispatchHttp468Request,
  [FlowNodeTypeEnum.appModule]: dispatchRunAppNode,
  [FlowNodeTypeEnum.pluginModule]: dispatchRunPlugin,
  [FlowNodeTypeEnum.pluginInput]: dispatchPluginInput,
  [FlowNodeTypeEnum.pluginOutput]: dispatchPluginOutput,
  [FlowNodeTypeEnum.queryExtension]: dispatchQueryExtension,
  [FlowNodeTypeEnum.tools]: dispatchRunTools,
  [FlowNodeTypeEnum.stopTool]: dispatchStopToolCall,
  [FlowNodeTypeEnum.toolParams]: dispatchToolParams,
  [FlowNodeTypeEnum.lafModule]: dispatchLafRequest,
  [FlowNodeTypeEnum.ifElseNode]: dispatchIfElse,
  [FlowNodeTypeEnum.variableUpdate]: dispatchUpdateVariable,
  [FlowNodeTypeEnum.code]: dispatchRunCode,
  [FlowNodeTypeEnum.textEditor]: dispatchTextEditor,
  [FlowNodeTypeEnum.customFeedback]: dispatchCustomFeedback,
  [FlowNodeTypeEnum.readFiles]: dispatchReadFiles,
  [FlowNodeTypeEnum.userSelect]: dispatchUserSelect,
  [FlowNodeTypeEnum.loop]: dispatchLoop,
  [FlowNodeTypeEnum.loopStart]: dispatchLoopStart,
  [FlowNodeTypeEnum.loopEnd]: dispatchLoopEnd,
  [FlowNodeTypeEnum.formInput]: dispatchFormInput,
  [FlowNodeTypeEnum.tool]: dispatchRunTool,

  // none
  [FlowNodeTypeEnum.systemConfig]: dispatchSystemConfig,
  [FlowNodeTypeEnum.pluginConfig]: () => Promise.resolve(),
  [FlowNodeTypeEnum.emptyNode]: () => Promise.resolve(),
  [FlowNodeTypeEnum.globalVariable]: () => Promise.resolve(),
  [FlowNodeTypeEnum.comment]: () => Promise.resolve(),
  [FlowNodeTypeEnum.toolSet]: () => Promise.resolve(),

  [FlowNodeTypeEnum.runApp]: dispatchAppRequest // abandoned
};
