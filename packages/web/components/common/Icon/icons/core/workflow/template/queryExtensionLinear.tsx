import React from 'react';

type QueryExtensionLinearLinearProps = React.SVGProps<SVGSVGElement>;

const QueryExtensionLinearLinear: React.FC<QueryExtensionLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#487FFF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.3 15.7l6.9-6.9" />
          <path d="M13.6 4l.62 1.78L16 6.4l-1.78.62L13.6 8.8l-.62-1.78L11.2 6.4l1.78-.62z" />
          <path d="M16.3 11.2l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" />
        </g>
        <path
          d="M13.6 4l.62 1.78L16 6.4l-1.78.62L13.6 8.8l-.62-1.78L11.2 6.4l1.78-.62z"
          fill="#487FFF"
        />
        <path d="M16.3 11.2l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" fill="#487FFF" />
      </g>
    </svg>
  );
};

export default QueryExtensionLinearLinear;
