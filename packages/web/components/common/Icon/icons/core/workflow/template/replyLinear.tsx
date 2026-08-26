import React from 'react';

type ReplyLinearProps = React.SVGProps<SVGSVGElement>;

const ReplyLinear: React.FC<ReplyLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#4C9FFF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9.3 5L4.8 9.5l4.5 4.5" />
          <path d="M4.8 9.5h6.7a4 4 0 0 1 4 4V16" />
        </g>
        <path d="M9.3 5L4.8 9.5l4.5 4.5z" fill="#4C9FFF" />
      </g>
    </svg>
  );
};

export default ReplyLinear;
