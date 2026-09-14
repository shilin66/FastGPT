import React from 'react';

type IconProps = {
  size: string;
};

export const AgentIcon = ({ size }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2C13 8 16 11 22 12C16 13 13 16 12 22C11 16 8 13 2 12C8 11 11 8 12 2Z"
      fill="currentColor"
    />
  </svg>
);

export const WorkflowIcon = ({ size }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6 6H18M6 6L12 18M18 6L12 18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="6" cy="6" r="2.5" fill="currentColor" />
    <circle cx="18" cy="6" r="2.5" fill="currentColor" />
    <circle cx="12" cy="18" r="2.5" fill="currentColor" />
  </svg>
);
