import { ErrorCode } from '@hypermarket/contracts';

import { FulfillmentError } from '../errors/FulfillmentError';

export const BUSINESS_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type BusinessDayKey = (typeof BUSINESS_DAY_KEYS)[number];

export type BusinessHoursDay = {
  is_closed: boolean;
  open_time?: string | null;
  close_time?: string | null;
};

export type BusinessHours = Partial<Record<BusinessDayKey, BusinessHoursDay>>;

export type BusinessOpenReason = 'CLOSED_TODAY' | 'OUTSIDE_BUSINESS_HOURS';

const DAY_INDEX_TO_KEY: Record<number, BusinessDayKey> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat'
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const assertBusinessHours = (hours: BusinessHours): BusinessHours => {
  for (const [day, value] of Object.entries(hours)) {
    if (!BUSINESS_DAY_KEYS.includes(day as BusinessDayKey)) {
      throw new FulfillmentError({
        code: ErrorCode.FulSettingsInvalid,
        message: `business_hours contains unsupported day "${day}"`
      });
    }

    if (typeof value !== 'object' || value === null || typeof value.is_closed !== 'boolean') {
      throw new FulfillmentError({
        code: ErrorCode.FulSettingsInvalid,
        message: `business_hours.${day} must define is_closed`
      });
    }

    if (value.is_closed) {
      continue;
    }

    if (
      typeof value.open_time !== 'string' ||
      typeof value.close_time !== 'string' ||
      !TIME_PATTERN.test(value.open_time) ||
      !TIME_PATTERN.test(value.close_time)
    ) {
      throw new FulfillmentError({
        code: ErrorCode.FulSettingsInvalid,
        message: `business_hours.${day} must include valid open_time and close_time`
      });
    }
  }

  return hours;
};

const toMinutes = (value: string): number => {
  const match = TIME_PATTERN.exec(value);
  if (match === null) {
    throw new FulfillmentError({
      code: ErrorCode.FulSettingsInvalid,
      message: `Invalid time value "${value}"`
    });
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

const getKampalaDayAndMinutes = (value: Date): { day: BusinessDayKey; minutes: number } => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(value);
  const weekday = parts.find((part) => part.type === 'weekday')?.value.toLowerCase();
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;

  const day =
    DAY_INDEX_TO_KEY[
      {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6
      }[weekday ?? ''] ?? -1
    ];

  if (day === undefined || hour === undefined || minute === undefined) {
    throw new FulfillmentError({
      code: ErrorCode.FulSettingsInvalid,
      message: 'Failed to resolve local business hours time'
    });
  }

  return {
    day,
    minutes: Number(hour) * 60 + Number(minute)
  };
};

export const isStoreOpen = (
  hours: BusinessHours,
  now: Date
): { open: true } | { open: false; reason: BusinessOpenReason } => {
  const validHours = assertBusinessHours(hours);
  const local = getKampalaDayAndMinutes(now);
  const dayHours = validHours[local.day];

  if (dayHours === undefined || dayHours.is_closed) {
    return {
      open: false,
      reason: 'CLOSED_TODAY'
    };
  }

  const openMinutes = toMinutes(dayHours.open_time!);
  const closeMinutes = toMinutes(dayHours.close_time!);
  if (local.minutes < openMinutes || local.minutes > closeMinutes) {
    return {
      open: false,
      reason: 'OUTSIDE_BUSINESS_HOURS'
    };
  }

  return {
    open: true
  };
};
