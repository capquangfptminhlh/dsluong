'use strict';

const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatBusinessDate(date = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError('Invalid business date');

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function parseDateOnly(value) {
  const match = DATE_ONLY_RE.exec(String(value || ''));
  if (!match) throw new TypeError('Invalid date-only value');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new TypeError('Invalid date-only value');
  return date;
}

function addCalendarDays(dateOnly, days) {
  const date = parseDateOnly(dateOnly);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function addCalendarMonths(dateOnly, months) {
  const date = parseDateOnly(dateOnly);
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
  return date.toISOString().slice(0, 10);
}

function calendarDayDifference(laterDateOnly, earlierDateOnly) {
  return Math.round((parseDateOnly(laterDateOnly) - parseDateOnly(earlierDateOnly)) / 86400000);
}

module.exports = {
  DEFAULT_BUSINESS_TIME_ZONE,
  formatBusinessDate,
  addCalendarDays,
  addCalendarMonths,
  calendarDayDifference,
};
