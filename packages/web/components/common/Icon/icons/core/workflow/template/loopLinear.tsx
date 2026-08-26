import React from 'react';

type LoopLinearProps = React.SVGProps<SVGSVGElement>;

const LoopLinear: React.FC<LoopLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          transform="translate(1.6 1.6) scale(0.7)"
          fill="none"
          stroke="#C071FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </g>
        <g fill="#C071FF">
          <path transform="translate(1.6 1.6) scale(0.7)" d="M21 3v5h-5z" />
          <path transform="translate(1.6 1.6) scale(0.7)" d="M8 16H3v5z" />
        </g>
      </g>
    </svg>
  );
};

export default LoopLinear;
