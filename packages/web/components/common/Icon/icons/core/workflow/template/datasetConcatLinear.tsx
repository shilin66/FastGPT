import React from 'react';

type DatasetConcatLinearLinearProps = React.SVGProps<SVGSVGElement>;

const DatasetConcatLinearLinear: React.FC<DatasetConcatLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#52A2FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6.5 8.1V5.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4.4a2 2 0 0 1-2 2h-1" />
          <rect x="3.5" y="8.1" width="10" height="8.4" rx="2" />
        </g>
        <rect x="3.5" y="8.1" width="10" height="8.4" rx="2" fill="#52A2FF" opacity="0.16" />
      </g>
    </svg>
  );
};

export default DatasetConcatLinearLinear;
