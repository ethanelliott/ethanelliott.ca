/**
 * Date utility functions for handling date-only strings ('YYYY-MM-DD')
 * These functions treat date strings as absolute dates without timezone conversion
 */

export interface ParsedDate {
  year: number;
  month: number; // 0-indexed for JavaScript Date compatibility
  day: number;
}

export const parseAbsoluteDate = (dateString: string): ParsedDate => {
  const parts = dateString.split('-');
  return {
    year: parseInt(parts[0]),
    month: parseInt(parts[1]) - 1, // Convert to 0-indexed for JavaScript Date
    day: parseInt(parts[2]),
  };
};

export const createAbsoluteDate = (dateString: string): Date => {
  const { year, month, day } = parseAbsoluteDate(dateString);
  return new Date(year, month, day);
};

export const isDateInMonth = (
  dateString: string,
  targetYear: number,
  targetMonth: number
): boolean => {
  const { year, month } = parseAbsoluteDate(dateString);
  return year === targetYear && month === targetMonth;
};

export const isDateInRange = (
  dateString: string,
  startDate: Date,
  endDate: Date
): boolean => {
  const absoluteDate = createAbsoluteDate(dateString);
  return absoluteDate >= startDate && absoluteDate <= endDate;
};

export const getDateDay = (dateString: string): number => {
  return parseAbsoluteDate(dateString).day;
};

export const getDateYear = (dateString: string): number => {
  return parseAbsoluteDate(dateString).year;
};

export const getDateMonth = (dateString: string): number => {
  return parseAbsoluteDate(dateString).month;
};

export const compareDates = (dateA: string, dateB: string): number => {
  const a = createAbsoluteDate(dateA);
  const b = createAbsoluteDate(dateB);
  return b.getTime() - a.getTime(); // For descending order (newest first)
};

export const formatAbsoluteDate = (
  dateString: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const absoluteDate = createAbsoluteDate(dateString);
  return absoluteDate.toLocaleDateString('en-US', options);
};

export const getWeekdayName = (dateString: string): string => {
  const absoluteDate = createAbsoluteDate(dateString);
  return absoluteDate.toLocaleDateString('en-US', { weekday: 'long' });
};
