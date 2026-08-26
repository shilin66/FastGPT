import React from 'react';

type UserSelectLinearLinearProps = React.SVGProps<SVGSVGElement>;

const UserSelectLinearLinear: React.FC<UserSelectLinearLinearProps> = (props) => {
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
          <circle cx="8.2" cy="6.8" r="3" />
          <path d="M3.2 16.6c.7-2.7 2.6-4 5-4 1 0 1.9.2 2.7.7" />
          <path d="M11.8 13.6l1.9 1.9 3.3-3.4" />
        </g>
        <circle cx="8.2" cy="6.8" r="3" fill="#B275FF" opacity="0.16" />
      </g>
    </svg>
  );
};

export default UserSelectLinearLinear;
