import React from 'react';

type HttpRequestLinearLinearProps = React.SVGProps<SVGSVGElement>;

const HttpRequestLinearLinear: React.FC<HttpRequestLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          transform="translate(1.6 1.6) scale(0.7)"
          fill="none"
          stroke="#7177FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </g>
        <g fill="#7177FF">
          <circle cx="3" cy="10" r="1.1" />
          <circle cx="17" cy="10" r="1.1" />
        </g>
      </g>
    </svg>
  );
};

export default HttpRequestLinearLinear;
