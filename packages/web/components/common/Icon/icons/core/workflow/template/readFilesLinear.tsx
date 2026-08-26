import React from 'react';

type ReadFilesLinearLinearProps = React.SVGProps<SVGSVGElement>;

const ReadFilesLinearLinear: React.FC<ReadFilesLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          transform="translate(1.6 1.6) scale(0.7)"
          fill="none"
          stroke="#13C7BC"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8M16 17H8M10 9H8" />
        </g>
        <path transform="translate(1.6 1.6) scale(0.7)" d="M14 2v6h6z" fill="#13C7BC" />
      </g>
    </svg>
  );
};

export default ReadFilesLinearLinear;
