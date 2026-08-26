import React from 'react';

type CodeRunLinearLinearProps = React.SVGProps<SVGSVGElement>;

const CodeRunLinearLinear: React.FC<CodeRunLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#13C993"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4.5" width="14" height="11" rx="2" />
          <path d="M6 8.4l2.4 2-2.4 2" />
          <path d="M10.4 12.4H14" />
        </g>
        <path d="M10.4 12.4H14" stroke="#13C993" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
};

export default CodeRunLinearLinear;
