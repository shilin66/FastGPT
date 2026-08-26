import React from 'react';

type LoopStartLinearLinearProps = React.SVGProps<SVGSVGElement>;

const LoopStartLinearLinear: React.FC<LoopStartLinearLinearProps> = (props) => {
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
          <path d="M8.7 7.6l3.9 2.4-3.9 2.4z" />
        </g>
        <path d="M8.7 7.6l3.9 2.4-3.9 2.4z" fill="#7394FF" />
      </g>
    </svg>
  );
};

export default LoopStartLinearLinear;
