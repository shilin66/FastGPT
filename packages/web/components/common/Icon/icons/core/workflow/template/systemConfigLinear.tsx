import React from 'react';

type SystemConfigLinearLinearProps = React.SVGProps<SVGSVGElement>;

const SystemConfigLinearLinear: React.FC<SystemConfigLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#FF7FA8"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 6.5h6.5" />
          <path d="M14.5 6.5h2" />
          <circle cx="12.5" cy="6.5" r="2" />
          <path d="M3.5 13.5h2" />
          <path d="M10 13.5h6.5" />
          <circle cx="7.8" cy="13.5" r="2" />
        </g>
        <g fill="#FF7FA8">
          <circle cx="12.5" cy="6.5" r="2" />
          <circle cx="7.8" cy="13.5" r="2" />
        </g>
      </g>
    </svg>
  );
};

export default SystemConfigLinearLinear;
