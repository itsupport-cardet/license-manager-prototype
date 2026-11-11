// Date helpers. All dates are stored as ISO strings "YYYY-MM-DD".

const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Parse the date formats found in the inventory sheet:
 * real Excel dates, "27/05/2025", "27-02-2027", "13.06.2025", "2026-10-08".
 * Text dates are read day-first (European). Returns ISO "YYYY-MM-DD" or null.
 */
export function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value) ? null : toISO(value);
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}

function valid(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return toISO(dt);
}

/** Add calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toISO(target);
}

export function daysBetween(fromISO, toISO_) {
  return Math.round((Date.parse(toISO_) - Date.parse(fromISO)) / 86400000);
}
