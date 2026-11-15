export const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function nextDay({ m, d }) {
  if (d < DAYS[m - 1]) return { m, d: d + 1 };
  return { m: (m % 12) + 1, d: 1 };
}

export function prevDay({ m, d }) {
  if (d > 1) return { m, d: d - 1 };
  const pm = ((m + 10) % 12) + 1;
  return { m: pm, d: DAYS[pm - 1] };
}

export const todayMD = (now = new Date()) => ({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

export const yearsForDay = (startYear, { m, d }) =>
  Array.from({ length: 5 }, (_, i) => {
    const year = startYear + i;
    return { year, disabled: m === 2 && d === 29 && !isLeap(year) };
  });

export const key = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
