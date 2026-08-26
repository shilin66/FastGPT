import { describe, expect, it } from 'vitest';
import { getBoundedRightPanelWidth } from '../../../src/components/common/resizableRightPanelWidth';

const widthBounds = {
  viewportWidth: 1440,
  minWidth: 420,
  maxWidth: 1120,
  viewportGutter: 32
} as const;

describe('getBoundedRightPanelWidth', () => {
  it('keeps a requested width when it is inside every boundary', () => {
    // Given
    const requestedWidth = 920;

    // When
    const width = getBoundedRightPanelWidth({ requestedWidth, ...widthBounds });

    // Then
    expect(width).toBe(920);
  });

  it('clamps a narrow request to the panel minimum', () => {
    // Given
    const requestedWidth = 280;

    // When
    const width = getBoundedRightPanelWidth({ requestedWidth, ...widthBounds });

    // Then
    expect(width).toBe(420);
  });

  it('clamps a wide request to the configured maximum', () => {
    // Given
    const requestedWidth = 1380;

    // When
    const width = getBoundedRightPanelWidth({ requestedWidth, ...widthBounds });

    // Then
    expect(width).toBe(1120);
  });

  it('preserves the viewport gutter when it is tighter than the configured maximum', () => {
    // Given
    const requestedWidth = 1120;

    // When
    const width = getBoundedRightPanelWidth({
      requestedWidth,
      ...widthBounds,
      viewportWidth: 900
    });

    // Then
    expect(width).toBe(868);
  });
});
