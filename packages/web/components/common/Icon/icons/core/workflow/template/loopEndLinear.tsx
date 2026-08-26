import React from 'react';

type LoopEndLinearLinearProps = React.SVGProps<SVGSVGElement>;

const LoopEndLinearLinear: React.FC<LoopEndLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#7394FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3.2a6.8 6.8 0 1 1-6.5 4.9" />
          <rect x="8" y="8" width="4" height="4" rx="1" />
        </g>
        <rect x="8" y="8" width="4" height="4" rx="1" fill="#7394FF" />
      </g>
    </svg>
  );
};

export default LoopEndLinearLinear;
