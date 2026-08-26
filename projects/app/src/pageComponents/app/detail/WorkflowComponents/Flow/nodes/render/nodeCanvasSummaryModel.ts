import { ContentTypes, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getElseIFLabel } from '@fastgpt/global/core/workflow/utils';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';

type Translate = (key: string) => string;

export type CanvasSummaryFact = {
  readonly label: string;
  readonly value: string;
};

export type CanvasBranch = {
  readonly id: string;
  readonly label: string;
};

export type CanvasNodeSummary = {
  readonly signature: string;
  readonly facts: readonly CanvasSummaryFact[];
};

const readInputValue = (node: FlowNodeItemType, key: NodeInputKeyEnum): unknown =>
  node.inputs.find((input) => input.key === key)?.value;

const hasValue = (value: unknown): boolean => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
};

const countValue = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const displayValue = (value: unknown, emptyText: string, translate: Translate): string => {
  if (typeof value === 'string') return value.trim() || emptyText;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') {
    return translate(value ? 'workflow:node_canvas.enabled' : 'workflow:node_canvas.disabled');
  }
  if (Array.isArray(value)) {
    const names = value
      .map((item) =>
        typeof item === 'object' && item && 'name' in item && typeof item.name === 'string'
          ? item.name
          : undefined
      )
      .filter((item): item is string => Boolean(item));

    return names.length > 0 ? names.slice(0, 2).join(', ') : String(value.length);
  }

  if (typeof value === 'object' && value) {
    if ('name' in value && typeof value.name === 'string') return value.name;
    return translate('workflow:node_canvas.configured');
  }

  return emptyText;
};

const translateLabel = (label: string | undefined, fallback: string, translate: Translate) =>
  label ? translate(label) : fallback;

export const getCanvasBranches = (
  node: FlowNodeItemType,
  translate: Translate
): readonly CanvasBranch[] => {
  if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    const conditions = readInputValue(node, NodeInputKeyEnum.ifElseList);
    const conditionCount = Array.isArray(conditions) ? conditions.length : 0;

    return [
      ...Array.from({ length: conditionCount }, (_, index) => ({
        id: getElseIFLabel(index),
        label: getElseIFLabel(index)
      })),
      { id: IfElseResultEnum.ELSE, label: IfElseResultEnum.ELSE }
    ];
  }

  if (
    node.flowNodeType === FlowNodeTypeEnum.userSelect ||
    node.flowNodeType === FlowNodeTypeEnum.classifyQuestion
  ) {
    const key =
      node.flowNodeType === FlowNodeTypeEnum.userSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.agents;
    const options = readInputValue(node, key);
    if (!Array.isArray(options)) return [];

    return options.flatMap((option) => {
      if (
        typeof option !== 'object' ||
        !option ||
        !('key' in option) ||
        !('value' in option) ||
        typeof option.key !== 'string'
      ) {
        return [];
      }

      return [{ id: option.key, label: String(option.value || option.key) }];
    });
  }

  return node.outputs
    .filter((output) => output.type === FlowNodeOutputTypeEnum.source && output.invalid !== true)
    .map((output) => ({
      id: output.key,
      label: translateLabel(output.label, output.key, translate)
    }));
};

export const getCanvasNodeSummary = (
  node: FlowNodeItemType,
  translate: Translate
): CanvasNodeSummary => {
  const emptyText = translate('workflow:node_canvas.not_configured');

  if (node.flowNodeType === FlowNodeTypeEnum.httpRequest468) {
    const method = displayValue(
      readInputValue(node, NodeInputKeyEnum.httpMethod),
      'POST',
      translate
    );
    const url = displayValue(
      readInputValue(node, NodeInputKeyEnum.httpReqUrl),
      emptyText,
      translate
    );
    const timeout = displayValue(
      readInputValue(node, NodeInputKeyEnum.httpTimeout),
      '30',
      translate
    );
    const contentType = displayValue(
      readInputValue(node, NodeInputKeyEnum.httpContentType),
      ContentTypes.none,
      translate
    );

    return {
      signature: `${method}  ${url}`,
      facts: [
        { label: translate('workflow:node_canvas.timeout'), value: `${timeout}s` },
        {
          label: translate('workflow:node_canvas.body'),
          value:
            contentType === ContentTypes.none ? translate('workflow:node_canvas.none') : contentType
        }
      ]
    };
  }

  if (
    node.flowNodeType === FlowNodeTypeEnum.agent ||
    node.flowNodeType === FlowNodeTypeEnum.chatNode
  ) {
    return {
      signature: displayValue(readInputValue(node, NodeInputKeyEnum.aiModel), emptyText, translate),
      facts: [
        {
          label: translate('workflow:node_canvas.knowledge'),
          value: String(countValue(readInputValue(node, NodeInputKeyEnum.datasetSelectList)))
        },
        {
          label: translate('workflow:node_canvas.tools'),
          value: String(countValue(readInputValue(node, NodeInputKeyEnum.selectedTools)))
        }
      ]
    };
  }

  if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
    const datasetCount = countValue(readInputValue(node, NodeInputKeyEnum.datasetSelectList));

    return {
      signature: `${translate('workflow:node_canvas.knowledge')} · ${datasetCount}`,
      facts: [
        {
          label: translate('workflow:node_canvas.mode'),
          value: displayValue(
            readInputValue(node, NodeInputKeyEnum.datasetSearchMode),
            emptyText,
            translate
          )
        },
        {
          label: translate('workflow:node_canvas.similarity'),
          value: displayValue(
            readInputValue(node, NodeInputKeyEnum.datasetSimilarity),
            emptyText,
            translate
          )
        }
      ]
    };
  }

  if (node.flowNodeType === FlowNodeTypeEnum.workflowStart) {
    return {
      signature: translate('workflow:node_canvas.session_entry'),
      facts: [
        {
          label: translate('workflow:node_canvas.outputs'),
          value: String(node.outputs.length)
        },
        {
          label: translate('workflow:node_canvas.variables'),
          value: String(node.outputs.filter((output) => output.required).length)
        }
      ]
    };
  }

  const configuredInputs = node.inputs.filter(
    (input) =>
      Boolean(input.label) &&
      hasValue(input.value) &&
      !input.renderTypeList?.includes(FlowNodeInputTypeEnum.hidden)
  );
  const [primaryInput, ...secondaryInputs] = configuredInputs;

  if (primaryInput) {
    return {
      signature: `${translate(primaryInput.label)} · ${displayValue(
        primaryInput.value,
        emptyText,
        translate
      )}`,
      facts: secondaryInputs.slice(0, 2).map((input) => ({
        label: translate(input.label),
        value: displayValue(input.value, emptyText, translate)
      }))
    };
  }

  return {
    signature: node.intro ? translate(node.intro) : emptyText,
    facts: [
      { label: translate('workflow:node_canvas.inputs'), value: String(node.inputs.length) },
      { label: translate('workflow:node_canvas.outputs'), value: String(node.outputs.length) }
    ]
  };
};
