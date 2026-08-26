import React from 'react';

type DatasetSearchLinearLinearProps = React.SVGProps<SVGSVGElement>;

const DatasetSearchLinearLinear: React.FC<DatasetSearchLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#0091FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.5 4.8C8.2 3.9 6.3 3.7 4.2 4.1v10.5c2.1-.4 4-.2 5.3.7" />
          <path d="M9.5 4.8v10.5" />
          <path d="M10.5 4.8c1.3-.9 3.2-1.1 5.3-.7v4.1" />
          <circle cx="13" cy="12" r="2.4" />
          <path d="M14.8 13.6l2.1 2.1" />
        </g>
        <circle cx="13" cy="12" r="1.1" fill="#0091FF" />
      </g>
    </svg>
  );
};

export default DatasetSearchLinearLinear;
