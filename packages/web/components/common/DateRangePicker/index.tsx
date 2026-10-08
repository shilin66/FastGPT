import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Card, Flex, useTheme, useOutsideClick, Button } from '@chakra-ui/react';
import { addDays, format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { zhCN } from 'react-day-picker/locale';
import { useTranslation } from 'next-i18next';
import MyIcon from '../Icon';
import { CalendarMonthsDropdown, CalendarYearsDropdown } from './CalendarDropdown';

export type DateRangeType = {
  from: Date;
  to: Date;
};

const DateRangePicker = ({
  onChange,
  onSuccess,
  popPosition = 'bottom',
  defaultDate = {
    from: addDays(new Date(), -30),
    to: new Date()
  },
  dateRange,
  formLabel,
  ...props
}: {
  onChange?: (date: DateRangeType) => void;
  onSuccess?: (date: DateRangeType) => void;
  popPosition?: 'bottom' | 'top';
  defaultDate?: DateRangeType;
  dateRange?: DateRangeType;
  formLabel?: string;
} & BoxProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const OutRangeRef = useRef(null);
  const [range, setRange] = useState<DateRangeType>(defaultDate);
  const [showSelected, setShowSelected] = useState(false);

  useEffect(() => {
    if (dateRange) {
      setRange(dateRange);
    }
  }, [dateRange]);

  const formatSelected = useMemo(() => {
    if (range?.from && range.to) {
      return `${format(range.from, 'y/MM/dd')} - ${format(range.to, 'y/MM/dd')}`;
    }
    return `${format(new Date(), 'y/MM/dd')} - ${format(new Date(), 'y/MM/dd')}`;
  }, [range]);

  useOutsideClick({
    ref: OutRangeRef,
    handler: () => {
      setShowSelected(false);
    }
  });

  return (
    <Box position={'relative'} ref={OutRangeRef}>
      <Flex
        as={'button'}
        type={'button'}
        border={'base'}
        px={3}
        pr={3}
        py={1}
        borderRadius={'sm'}
        cursor={'pointer'}
        bg={'myGray.50'}
        fontSize={'sm'}
        onClick={() => setShowSelected(true)}
        alignItems={'center'}
        {...props}
      >
        {formLabel && (
          <>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {formLabel}
            </Box>
            <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
          </>
        )}
        <Box color={'myGray.600'} fontWeight={'400'} flex={1}>
          {formatSelected}
        </Box>
        {!formLabel && <MyIcon ml={2} name={'date'} w={'16px'} color={'myGray.600'} />}
      </Flex>
      {showSelected && (
        <Card
          position={'absolute'}
          zIndex={'popover'}
          p={4}
          border={'base'}
          borderRadius={'lg'}
          boxShadow={'3'}
          {...(popPosition === 'top'
            ? {
                bottom: '40px'
              }
            : {})}
        >
          <Box
            sx={{
              '.rdp-root': {
                fontSize: 'sm',
                color: 'myGray.900'
              },
              '.rdp-dropdowns': {
                gap: 2
              },
              '.rdp-weekday': {
                fontSize: 'xs',
                fontWeight: 'medium',
                color: 'myGray.500'
              },
              '.rdp-day_button': {
                fontSize: 'sm',
                fontWeight: 'normal'
              },
              '.rdp-selected': {
                fontSize: 'inherit',
                fontWeight: 'medium'
              },
              '.rdp-day_button:hover:not(:disabled)': {
                backgroundColor: 'primary.50'
              },
              '.rdp-range_start .rdp-day_button, .rdp-range_end .rdp-day_button': {
                backgroundColor: 'primary.600',
                color: 'white',
                border: 'none',
                fontWeight: 'medium'
              },
              '.rdp-range_start .rdp-day_button:hover, .rdp-range_end .rdp-day_button:hover': {
                backgroundColor: 'primary.700'
              },
              '.rdp-button_previous, .rdp-button_next': {
                borderRadius: 'md'
              },
              '.rdp-button_previous:hover, .rdp-button_next:hover': {
                backgroundColor: 'myGray.50'
              },
              '.rdp-chevron': {
                width: 4,
                height: 4
              }
            }}
          >
            <DayPicker
              locale={zhCN}
              id="test"
              mode="range"
              captionLayout="dropdown"
              startMonth={new Date(2025, 0, 1)}
              components={{
                MonthsDropdown: CalendarMonthsDropdown,
                YearsDropdown: CalendarYearsDropdown
              }}
              formatters={{ formatMonthDropdown: (date) => format(date, 'M 月') }}
              style={
                {
                  '--rdp-accent-color': theme.colors.primary[600],
                  '--rdp-accent-background-color': theme.colors.primary[50],
                  '--rdp-day-height': '38px',
                  '--rdp-day-width': '38px',
                  '--rdp-day_button-height': '34px',
                  '--rdp-day_button-width': '34px',
                  '--rdp-nav_button-height': '32px',
                  '--rdp-nav_button-width': '32px',
                  '--rdp-nav-height': '40px'
                } as React.CSSProperties
              }
              defaultMonth={defaultDate.to}
              selected={range}
              disabled={[
                { from: new Date(2022, 3, 1), to: addDays(new Date(), -180) },
                { from: addDays(new Date(), 1), to: new Date(2099, 1, 1) }
              ]}
              onSelect={(date) => {
                let typeDate = date as DateRangeType;
                if (!typeDate || typeDate?.from === undefined) {
                  typeDate = {
                    from: range?.from,
                    to: range?.from
                  };
                }
                if (typeDate?.to === undefined) {
                  typeDate.to = typeDate.from;
                }

                if (typeDate?.from) {
                  typeDate.from = new Date(typeDate.from.setHours(0, 0, 0, 0));
                }
                if (typeDate?.to) {
                  typeDate.to = new Date(typeDate.to.setHours(23, 59, 59, 999));
                }

                setRange(typeDate);
                onChange?.(typeDate);
              }}
              footer={
                <Flex justifyContent={'flex-end'} borderTop={'base'} pt={3} mt={3}>
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    mr={2}
                    onClick={() => setShowSelected(false)}
                  >
                    {t('common:Close')}
                  </Button>
                  <Button
                    size={'sm'}
                    onClick={() => {
                      onSuccess?.(range || defaultDate);
                      setShowSelected(false);
                    }}
                  >
                    {t('common:Confirm')}
                  </Button>
                </Flex>
              }
            />
          </Box>
        </Card>
      )}
    </Box>
  );
};

export default DateRangePicker;
