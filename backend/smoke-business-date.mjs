import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  formatBusinessDate,
  addCalendarDays,
  addCalendarMonths,
  calendarDayDifference,
} = require('./utils/businessDate');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  formatBusinessDate(new Date('2026-08-12T17:30:00.000Z')) === '2026-08-13',
  'Vietnam business date must roll to the next day after 00:00 ICT even while UTC is still previous day',
);

assert(
  formatBusinessDate(new Date('2026-08-13T16:59:59.000Z')) === '2026-08-13',
  'Vietnam business date must remain on the same local day before 00:00 ICT',
);

assert(
  formatBusinessDate(new Date('2026-08-13T17:00:00.000Z')) === '2026-08-14',
  'Vietnam business date must roll over exactly at 00:00 ICT',
);

assert(addCalendarDays('2026-08-13', 30) === '2026-09-12', 'calendar-day addition mismatch');
assert(addCalendarMonths('2026-08-13', 12) === '2027-08-13', 'calendar-month addition mismatch');
assert(calendarDayDifference('2026-08-14', '2026-08-13') === 1, 'calendar-day difference mismatch');

console.log('[SMOKE] BUSINESS DATE PASS');
