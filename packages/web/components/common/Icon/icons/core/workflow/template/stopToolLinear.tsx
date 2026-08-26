import React from 'react';

type StopToolLinearLinearProps = React.SVGProps<SVGSVGElement>;

const StopToolLinearLinear: React.FC<StopToolLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#FF6060"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="10" cy="10" r="7.2" />
          <rect x="7.6" y="7.6" width="4.8" height="4.8" rx="1" />
        </g>
        <rect x="7.6" y="7.6" width="4.8" height="4.8" rx="1" fill="#FF6060" />
      </g>
    </svg>
  );
};

export default StopToolLinearLinear;
