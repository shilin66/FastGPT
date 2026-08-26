import React from 'react';

type QuestionClassifyLinearLinearProps = React.SVGProps<SVGSVGElement>;

const QuestionClassifyLinearLinear: React.FC<QuestionClassifyLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#C071FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3.2v3" />
          <path d="M10 6.2c0 2-4.5 1.4-4.5 3.3" />
          <path d="M10 6.2c0 2 4.5 1.4 4.5 3.3" />
          <rect x="2.9" y="11.5" width="5.2" height="4.6" rx="1.6" />
          <rect x="11.9" y="11.5" width="5.2" height="4.6" rx="1.6" />
        </g>
        <g fill="#C071FF">
          <rect x="2.9" y="11.5" width="5.2" height="4.6" rx="1.6" />
          <rect x="11.9" y="11.5" width="5.2" height="4.6" rx="1.6" />
        </g>
      </g>
    </svg>
  );
};

export default QuestionClassifyLinearLinear;
