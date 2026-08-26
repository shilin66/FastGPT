import React from 'react';

type PluginOutputLinearLinearProps = React.SVGProps<SVGSVGElement>;

const PluginOutputLinearLinear: React.FC<PluginOutputLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#5289FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3.5H5.5A1.5 1.5 0 0 0 4 5v10a1.5 1.5 0 0 0 1.5 1.5H8" />
          <path d="M10.5 10H17" />
          <path d="M14.5 7.5L17 10l-2.5 2.5" />
        </g>
        <path d="M14.5 7.5L17 10l-2.5 2.5z" fill="#5289FF" />
      </g>
    </svg>
  );
};

export default PluginOutputLinearLinear;
