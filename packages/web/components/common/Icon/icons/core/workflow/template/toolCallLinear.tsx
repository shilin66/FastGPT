import React from 'react';

type ToolCallLinearLinearProps = React.SVGProps<SVGSVGElement>;

const ToolCallLinearLinear: React.FC<ToolCallLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          transform="translate(1.6 1.6) scale(0.7)"
          fill="none"
          stroke="#4383FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </g>
        <circle cx="5" cy="5" r="1.2" fill="#4383FF" />
      </g>
    </svg>
  );
};

export default ToolCallLinearLinear;
