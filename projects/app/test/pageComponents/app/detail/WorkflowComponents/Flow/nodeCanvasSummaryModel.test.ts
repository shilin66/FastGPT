import { describe, expect, it } from 'vitest';
import {
  ContentTypes,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  getCanvasBranches,
  getCanvasNodeSummary
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/nodeCanvasSummaryModel';

const translate = (key: string) => key;

const createNode = (
  flowNodeType: FlowNodeTypeEnum,
  overrides: Partial<FlowNodeItemType> = {}
): FlowNodeItemType =>
  ({
    id: 'template',
    templateType: 'system',
    nodeId: 'node-1',
    flowNodeType,
    name: 'Node',
    inputs: [],
    outputs: [],
    ...overrides
  }) as FlowNodeItemType;

const createInput = (key: string, label: string, value: unknown) => ({
  key,
  label,
  value,
  valueType: WorkflowIOValueTypeEnum.any,
  renderTypeList: [FlowNodeInputTypeEnum.input]
});

describe('nodeCanvasSummaryModel', () => {
  it('builds an HTTP execution signature without repeating generic IO counts', () => {
    const node = createNode(FlowNodeTypeEnum.httpRequest468, {
      inputs: [
        createInput(NodeInputKeyEnum.httpMethod, 'method', 'POST'),
        createInput(NodeInputKeyEnum.httpReqUrl, 'url', 'https://example.com/tickets'),
        createInput(NodeInputKeyEnum.httpTimeout, 'timeout', 45),
        createInput(NodeInputKeyEnum.httpContentType, 'contentType', ContentTypes.json)
      ]
    });

    const summary = getCanvasNodeSummary(node, translate);

    expect(summary.signature).toBe('POST  https://example.com/tickets');
    expect(summary.facts).toEqual([
      { label: 'workflow:node_canvas.timeout', value: '45s' },
      { label: 'workflow:node_canvas.body', value: ContentTypes.json }
    ]);
  });

  it('keeps the original branch keys used by workflow edges', () => {
    const node = createNode(FlowNodeTypeEnum.userSelect, {
      inputs: [
        createInput(NodeInputKeyEnum.userSelectOptions, 'options', [
          { key: 'route-a', value: '人工处理' },
          { key: 'route-b', value: '自动回复' }
        ])
      ]
    });

    expect(getCanvasBranches(node, translate)).toEqual([
      { id: 'route-a', label: '人工处理' },
      { id: 'route-b', label: '自动回复' }
    ]);
  });

  it('ignores hidden system values when choosing a generic summary', () => {
    const hiddenInput = {
      ...createInput('secret', 'secret', 'internal'),
      renderTypeList: [FlowNodeInputTypeEnum.hidden]
    };
    const visibleInput = createInput('query', 'query_label', 'customerId');
    const node = createNode(FlowNodeTypeEnum.variableUpdate, {
      intro: 'node_intro',
      inputs: [hiddenInput, visibleInput],
      outputs: [
        {
          id: 'output',
          key: 'output',
          label: 'result',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    });

    expect(getCanvasNodeSummary(node, translate).signature).toBe('query_label · customerId');
  });
});
