import React from 'react';
import type { ReactNode } from 'react';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const PublishEmptyState = ({ text }: { text: ReactNode }) => {
  return <EmptyTip text={text} mt={0} minH={'128px'} py={8} iconSize={'36px'} />;
};

export default PublishEmptyState;
