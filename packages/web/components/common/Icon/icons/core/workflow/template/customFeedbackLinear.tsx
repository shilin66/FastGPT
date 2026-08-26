import React from 'react';

type CustomFeedbackLinearLinearProps = React.SVGProps<SVGSVGElement>;

const CustomFeedbackLinearLinear: React.FC<CustomFeedbackLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#4BAD1D"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="6.5" width="10" height="9" rx="2" />
          <path d="M13.8 8.7l2.9-2.9" />
          <path d="M14 5.6h2.9v2.9" />
        </g>
        <path d="M14 5.6h2.9v2.9z" fill="#4BAD1D" />
      </g>
    </svg>
  );
};

export default CustomFeedbackLinearLinear;
