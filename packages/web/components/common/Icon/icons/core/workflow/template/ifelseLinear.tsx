import React from 'react';

type IfelseLinearLinearProps = React.SVGProps<SVGSVGElement>;

const IfelseLinearLinear: React.FC<IfelseLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#43CA40"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 2.8l2.9 2.9-2.9 2.9-2.9-2.9z" />
          <path d="M10 8.6v2" />
          <path d="M10 10.6c0 2-5 1.4-5 3.3v1.3" />
          <path d="M10 10.6c0 2 5 1.4 5 3.3v1.3" />
        </g>
        <path d="M10 2.8l2.9 2.9-2.9 2.9-2.9-2.9z" fill="#43CA40" />
      </g>
    </svg>
  );
};

export default IfelseLinearLinear;
