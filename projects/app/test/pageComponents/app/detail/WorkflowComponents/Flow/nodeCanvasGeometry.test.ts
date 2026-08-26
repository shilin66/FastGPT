import { describe, expect, it } from 'vitest';
import { nodeCanvasGeometry } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/nodeCanvasGeometry';

describe('nodeCanvasGeometry', () => {
  it('aligns source handles from nested summary lanes with the node edge', () => {
    // Given: the summary lane ends inside the node shell by its content inset.
    const nodeRight = 304;

    // When: both source-handle centers are projected onto the node coordinate space.
    const edgeHandleCenter = nodeRight + nodeCanvasGeometry.nodeEdgeSourceHandleTranslate[0];
    const summaryHandleCenter =
      nodeRight -
      nodeCanvasGeometry.summaryRightInset +
      nodeCanvasGeometry.summarySourceHandleTranslate[0];

    // Then: every source handle occupies the same vertical edge axis.
    expect(summaryHandleCenter).toBe(edgeHandleCenter);
  });
});
