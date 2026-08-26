import React from 'react';

type WorkflowStartLinearLinearProps = React.SVGProps<SVGSVGElement>;

const WorkflowStartLinearLinear: React.FC<WorkflowStartLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#5B7CFA"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="10" cy="10" r="7.2" />
          <path d="M8.5 7.3l4.6 2.7-4.6 2.7z" />
        </g>
        <path d="M8.5 7.3l4.6 2.7-4.6 2.7z" fill="#5B7CFA" />
      </g>
    </svg>
  );
};

export default WorkflowStartLinearLinear;
