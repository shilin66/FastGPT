import React from 'react';

type AiChatLinearLinearProps = React.SVGProps<SVGSVGElement>;

const AiChatLinearLinear: React.FC<AiChatLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#7479FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4.2" y="7.6" width="11.6" height="9" rx="2.8" />
          <path d="M10 7.6V5.6" />
          <circle cx="10" cy="4.3" r="1.3" />
          <path d="M2.6 10.8h1.6M15.8 10.8h1.6" />
          <path d="M8.3 14.4h3.4" />
        </g>
        <circle cx="8" cy="10.8" r="0.95" fill="#7479FF" />
        <circle cx="12" cy="10.8" r="0.95" fill="#7479FF" />
        <circle cx="10" cy="4.3" r="1.3" fill="#7479FF" />
      </g>
    </svg>
  );
};

export default AiChatLinearLinear;
