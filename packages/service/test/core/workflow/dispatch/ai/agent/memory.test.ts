import { describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildAgentMemory,
  getAgentHistories,
  readAgentMemory,
  restoreAgentPlan
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/memory';

vi.mock('@fastgpt/service/core/workflow/dispatch/utils', () => ({
  getHistories: (history: number | ChatItemMiniType[], histories: ChatItemMiniType[]) =>
    Array.isArray(history) ? history : history ? histories.slice(-history * 2) : []
}));

const plan = {
  planId: 'plan-1',
  task: 'Task',
  description: 'Description',
  steps: [{ id: 'step-1', title: 'Step', description: 'Work', response: 'done' }]
};
const messages = [{ role: 'user' as const, content: 'original task' }];
const pendingAI = (memories?: Record<string, unknown>): ChatItemMiniType => ({
  obj: ChatRoleEnum.AI,
  value: [
    {
      interactive: {
        type: 'agentPlanAskQuery',
        params: { content: 'Question?' },
        entryNodeIds: ['node-1'],
        memoryEdges: [],
        nodeOutputs: []
      }
    }
  ],
  memories
});

describe('Agent paused memory boundary', () => {
  it('accepts an old pending Plan check whose empty params were minimized by Mongo', () => {
    const history = pendingAI(
      buildAgentMemory({
        nodeId: 'node-1',
        engine: 'default',
        status: 'paused',
        providerState: { pendingMainContext: messages }
      })
    );
    if (history.obj !== ChatRoleEnum.AI) throw new Error('Expected AI history');
    history.value[0].interactive = {
      type: 'agentPlanCheck',
      params: {},
      entryNodeIds: ['node-1'],
      memoryEdges: [],
      nodeOutputs: []
    };
    Reflect.deleteProperty(history.value[0].interactive, 'params');
    expect(
      readAgentMemory({ histories: [history], nodeId: 'node-1', engine: 'default' })?.status
    ).toBe('paused');
  });
  it('retains only the last Human + AI pair when history is zero and this node has a pending ask', () => {
    const pair: ChatItemMiniType[] = [
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Task' } }] },
      pendingAI()
    ];
    expect(getAgentHistories({ history: 0, histories: pair, nodeId: 'node-1' })).toEqual(pair);
    expect(getAgentHistories({ history: 0, histories: pair, nodeId: 'other' })).toEqual([]);
    pair[1] = { obj: ChatRoleEnum.AI, value: [{ text: { content: 'done' } }] };
    expect(getAgentHistories({ history: 0, histories: pair, nodeId: 'node-1' })).toEqual([]);
  });

  it('restores only paused state of the same engine from the last AI with an unfinished interaction', () => {
    const memories = buildAgentMemory({
      nodeId: 'node-1',
      engine: 'default',
      status: 'paused',
      providerState: { pendingMainContext: messages }
    });
    expect(
      readAgentMemory({ histories: [pendingAI(memories)], nodeId: 'node-1', engine: 'default' })
        ?.providerState
    ).toEqual({ pendingMainContext: messages });
    expect(
      readAgentMemory({ histories: [pendingAI(memories)], nodeId: 'node-1', engine: 'pi' })
    ).toBeUndefined();
    expect(
      readAgentMemory({
        histories: [{ obj: ChatRoleEnum.AI, value: [], memories }],
        nodeId: 'node-1',
        engine: 'default'
      })
    ).toBeUndefined();
    expect(
      readAgentMemory({
        histories: [pendingAI(memories), { obj: ChatRoleEnum.Human, value: [] }],
        nodeId: 'node-1',
        engine: 'default'
      })
    ).toBeUndefined();
  });

  it.each(['completed', 'failed'] as const)(
    'clears provider state and old keys after %s; never falls back to stale old keys',
    (status) => {
      const memories = buildAgentMemory({ nodeId: 'node-1', engine: 'default', status });
      expect(memories['agentLoopMemory-node-1']).toEqual({
        schemaVersion: 1,
        engine: 'default',
        status
      });
      expect(memories['masterMessages-node-1']).toBeUndefined();
      expect(
        readAgentMemory({
          histories: [pendingAI({ ...memories, 'masterMessages-node-1': messages })],
          nodeId: 'node-1',
          engine: 'default'
        })
      ).toBeUndefined();
    }
  );

  it('normalizes old memory only on an actual pending interaction, rejecting invalid shapes', () => {
    expect(
      readAgentMemory({
        histories: [pendingAI({ 'masterMessages-node-1': messages })],
        nodeId: 'node-1',
        engine: 'default'
      })?.providerState
    ).toEqual({ pendingMainContext: messages });
    expect(
      readAgentMemory({
        histories: [pendingAI({ 'masterMessages-node-1': [42] })],
        nodeId: 'node-1',
        engine: 'default'
      })
    ).toBeUndefined();
    const answered = pendingAI({ 'masterMessages-node-1': messages });
    const interactive =
      answered.obj === ChatRoleEnum.AI ? answered.value[0].interactive : undefined;
    if (interactive?.type === 'agentPlanAskQuery') interactive.params.answer = 'answered';
    expect(
      readAgentMemory({ histories: [answered], nodeId: 'node-1', engine: 'default' })
    ).toBeUndefined();
  });
});

describe('Agent plan event authority', () => {
  it('does not revive legacy Plan when the canonical memory key exists but is invalid', () => {
    expect(
      restoreAgentPlan({
        histories: [pendingAI({ 'agentLoopMemory-node-1': null, 'agentPlan-node-1': plan })],
        nodeId: 'node-1'
      })
    ).toBeUndefined();
  });
  it('restores latest step responses from update events without a Plan memory copy', () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { planEvent: { nodeId: 'node-1', type: 'create', plan: { ...plan, steps: [] } } },
          { planEvent: { nodeId: 'node-1', type: 'update', plan } }
        ]
      }
    ];
    expect(restoreAgentPlan({ histories, nodeId: 'node-1' })).toEqual(plan);
    expect(restoreAgentPlan({ histories, nodeId: 'other' })).toBeUndefined();
  });

  it.each(['completed', 'update'] as const)(
    'stops at a %s/null tombstone instead of reviving an older plan',
    (type) => {
      const history = pendingAI({ 'agentPlan-node-1': plan });
      if (history.obj === ChatRoleEnum.AI)
        history.value.unshift(
          { planEvent: { nodeId: 'node-1', type: 'create', plan } },
          { planEvent: { nodeId: 'node-1', type, plan: null } }
        );
      expect(restoreAgentPlan({ histories: [history], nodeId: 'node-1' })).toBeUndefined();
    }
  );
});
