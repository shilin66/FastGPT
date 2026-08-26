type RightPanelWidthBounds = {
  readonly requestedWidth: number;
  readonly viewportWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly viewportGutter: number;
};

export const getBoundedRightPanelWidth = ({
  requestedWidth,
  viewportWidth,
  minWidth,
  maxWidth,
  viewportGutter
}: RightPanelWidthBounds) => {
  const viewportMaximum = Math.max(minWidth, viewportWidth - viewportGutter);
  const boundedMaximum = Math.min(maxWidth, viewportMaximum);

  return Math.min(Math.max(requestedWidth, minWidth), boundedMaximum);
};
