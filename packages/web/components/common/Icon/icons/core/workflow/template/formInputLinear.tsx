import React from 'react';

type FormInputLinearLinearProps = React.SVGProps<SVGSVGElement>;

const FormInputLinearLinear: React.FC<FormInputLinearLinearProps> = (props) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" {...props}>
      <g transform="scale(2.4)">
        <g
          fill="none"
          stroke="#B275FF"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="4" width="13" height="12" rx="2" />
          <path d="M6.5 8.2h7" />
          <path d="M6.5 12h3.2" />
          <path d="M12.6 11.2v1.6" />
        </g>
        <path d="M12.6 11.2v1.6" stroke="#B275FF" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
};

export default FormInputLinearLinear;
