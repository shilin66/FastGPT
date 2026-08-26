import React from 'react';

type ToolParamsLinearLinearProps = React.SVGProps<SVGSVGElement>;

const ToolParamsLinearLinear: React.FC<ToolParamsLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#B276FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 5.5h13" />
          <circle cx="8" cy="5.5" r="1.8" />
          <path d="M3.5 10h13" />
          <circle cx="12.8" cy="10" r="1.8" />
          <path d="M3.5 14.5h13" />
          <circle cx="6.6" cy="14.5" r="1.8" />
        </g>
        <g fill="#B276FF">
          <circle cx="8" cy="5.5" r="1.8" />
          <circle cx="12.8" cy="10" r="1.8" />
          <circle cx="6.6" cy="14.5" r="1.8" />
        </g>
      </g>
    </svg>
  );
};

export default ToolParamsLinearLinear;
