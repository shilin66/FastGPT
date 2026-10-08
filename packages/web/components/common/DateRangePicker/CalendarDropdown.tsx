import React from 'react';
import { setMonth, setYear } from 'date-fns';
import { useDayPicker, type DropdownProps } from 'react-day-picker';
import { Box } from '@chakra-ui/react';
import MySelect from '../MySelect';

const CalendarDropdown = ({
  kind,
  options = [],
  value,
  disabled,
  'aria-label': ariaLabel
}: DropdownProps & { kind: 'year' | 'month' }) => {
  const { months, goToMonth } = useDayPicker();

  return (
    <MySelect<number>
      aria-label={ariaLabel}
      value={Number(value)}
      list={options
        .filter((option) => !option.disabled)
        .map((option) => ({
          value: option.value,
          label: (
            <Box as={'span'} whiteSpace={'nowrap'}>
              {kind === 'year' ? `${option.label} 年` : option.label}
            </Box>
          )
        }))}
      onChange={(nextValue) => {
        const month = months[0]?.date;
        if (!month) return;
        goToMonth(kind === 'year' ? setYear(month, nextValue) : setMonth(month, nextValue));
      }}
      isDisabled={disabled}
      w={kind === 'year' ? '100px' : '84px'}
      h={8}
      px={2}
      fontSize={'sm'}
      fontWeight={'medium'}
      borderRadius={'md'}
    />
  );
};

export const CalendarYearsDropdown = (props: DropdownProps) => (
  <CalendarDropdown {...props} kind={'year'} />
);

export const CalendarMonthsDropdown = (props: DropdownProps) => (
  <CalendarDropdown {...props} kind={'month'} />
);
