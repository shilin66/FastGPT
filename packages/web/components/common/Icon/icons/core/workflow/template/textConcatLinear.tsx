import React from 'react';

type TextConcatLinearLinearProps = React.SVGProps<SVGSVGElement>;

const TextConcatLinearLinear: React.FC<TextConcatLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#FAA303"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 5.2h5.2" />
          <path d="M3.5 10h4.2" />
          <path d="M3.5 14.8h5.2" />
          <path d="M12 10h4.8" />
          <path d="M14.6 7.8L16.8 10l-2.2 2.2" />
        </g>
        <path d="M14.6 7.8L16.8 10l-2.2 2.2z" fill="#FAA303" />
      </g>
    </svg>
  );
};

export default TextConcatLinearLinear;
