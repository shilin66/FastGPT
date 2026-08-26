import React from 'react';

type ParallelRunLinearProps = React.SVGProps<SVGSVGElement>;

const ParallelRunLinear: React.FC<ParallelRunLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#C071FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6.5 3.5v9" />
          <path d="M13.5 3.5v9" />
          <path d="M4.5 12.5l2 2.7 2-2.7" />
          <path d="M11.5 12.5l2 2.7 2-2.7" />
        </g>
        <g fill="#C071FF">
          <path d="M4.5 12.5l2 2.7 2-2.7z" />
          <path d="M11.5 12.5l2 2.7 2-2.7z" />
        </g>
      </g>
    </svg>
  );
};

export default ParallelRunLinear;
