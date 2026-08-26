import React from 'react';

type ExtractJsonLinearLinearProps = React.SVGProps<SVGSVGElement>;

const ExtractJsonLinearLinear: React.FC<ExtractJsonLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#00C874"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.3 3.5c-1.7 0-1.7 1.5-1.7 2.6 0 1 0 1.9-1.6 2.5-.4.15-.4.85 0 1 1.6.6 1.6 1.5 1.6 2.5 0 1.1 0 2.6 1.7 2.6" />
          <path d="M12.7 3.5c1.7 0 1.7 1.5 1.7 2.6 0 1 0 1.9 1.6 2.5.4.15.4.85 0 1-1.6.6-1.6 1.5-1.6 2.5 0 1.1 0 2.6-1.7 2.6" />
          <circle cx="10" cy="10" r="1.25" />
        </g>
        <circle cx="10" cy="10" r="1.25" fill="#00C874" />
      </g>
    </svg>
  );
};

export default ExtractJsonLinearLinear;
