import React from 'react';

type AgentLinearProps = React.SVGProps<SVGSVGElement>;

const AgentLinear: React.FC<AgentLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#7479FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.4 3.6h8.4a2.5 2.5 0 0 1 2.5 2.5v5.2a2.5 2.5 0 0 1-2.5 2.5h-1v2.9l-3.3-2.9H5.4a2.5 2.5 0 0 1-2.5-2.5V6.1a2.5 2.5 0 0 1 2.5-2.5z" />
          <path d="M10 7.2l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" />
        </g>
        <path d="M10 7.2l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" fill="#7479FF" />
      </g>
    </svg>
  );
};

export default AgentLinear;
