import React from 'react';

type VariableUpdateLinearLinearProps = React.SVGProps<SVGSVGElement>;

const VariableUpdateLinearLinear: React.FC<VariableUpdateLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#797EFF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 10a6 6 0 1 1-1.76-4.24" />
          <path d="M16 3.4v2.8h-2.8" />
          <path d="M8.1 8.1l3.8 3.8m0-3.8l-3.8 3.8" />
        </g>
        <path d="M16 3.4v2.8h-2.8z" fill="#797EFF" />
      </g>
    </svg>
  );
};

export default VariableUpdateLinearLinear;
