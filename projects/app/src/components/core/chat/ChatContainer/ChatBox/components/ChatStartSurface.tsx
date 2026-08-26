import React, { type ReactNode } from 'react';

type ChatStartSurfaceProps = {
  readonly variableEntry?: ReactNode;
  readonly welcome?: ReactNode;
  readonly conversation?: ReactNode;
};

export const ChatStartSurface = ({
  variableEntry,
  welcome,
  conversation
}: ChatStartSurfaceProps) => (
  <>
    {variableEntry}
    {welcome}
    {conversation}
  </>
);
