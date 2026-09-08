/**
 * Date formatting and parsing utility functions
 */

const MONTH_NAMES_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11
};

/**
 * Converts a YYYY-MM-DD string or Date object to "DD-MMM-YYYY" (e.g. "2026-09-08" -> "08-SEP-2026").
 * If the input is already in "DD-MMM-YYYY" format, it returns it formatted uppercase.
 */
export function formatToDisplayDate(dateInput?: string | Date | null): string {
  if (!dateInput) {
    const d = new Date();
    return formatFromDateObj(d);
  }

  if (dateInput instanceof Date) {
    return formatFromDateObj(dateInput);
  }

  const trimmed = dateInput.trim();
  // If already DD-MMM-YYYY
  const displayRegex = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
  const displayMatch = trimmed.match(displayRegex);
  if (displayMatch) {
    const day = String(displayMatch[1]).padStart(2, '0');
    const month = displayMatch[2].toUpperCase();
    const year = displayMatch[3];
    return `${day}-${month}-${year}`;
  }

  // If ISO format: YYYY-MM-DD
  const isoRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
  const isoMatch = trimmed.match(isoRegex);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const monthStr = MONTH_NAMES_SHORT[m] || 'JAN';
    return `${String(d).padStart(2, '0')}-${monthStr}-${y}`;
  }

  // Fallback try standard parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return formatFromDateObj(parsed);
  }

  return trimmed;
}

function formatFromDateObj(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Normalizes any date string (DD-MMM-YYYY or YYYY-MM-DD) into standard ISO "YYYY-MM-DD".
 * This is used for database filtering, sorting, and storage.
 */
export function parseToIsoDate(dateInput?: string | null): string {
  if (!dateInput) {
    return new Date().toISOString().split('T')[0];
  }

  const trimmed = dateInput.trim();

  // If DD-MMM-YYYY (e.g. "08-SEP-2026" or "8-sep-2026")
  const displayRegex = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
  const displayMatch = trimmed.match(displayRegex);
  if (displayMatch) {
    const day = String(displayMatch[1]).padStart(2, '0');
    const monthStr = displayMatch[2].toUpperCase();
    const monthNum = MONTH_MAP[monthStr] !== undefined ? MONTH_MAP[monthStr] + 1 : 1;
    const year = displayMatch[3];
    return `${year}-${String(monthNum).padStart(2, '0')}-${day}`;
  }

  // If already YYYY-MM-DD
  const isoRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
  const isoMatch = trimmed.match(isoRegex);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(isoMatch[2]).padStart(2, '0');
    const d = String(isoMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

/**
 * Returns today's date formatted as "DD-MMM-YYYY"
 */
export function getTodayDisplayDate(): string {
  return formatToDisplayDate(new Date());
}

/**
 * Shifts a display date "DD-MMM-YYYY" by a number of days (+1 or -1)
 */
export function shiftDisplayDate(displayDate: string, days: number): string {
  const iso = parseToIsoDate(displayDate);
  const parts = iso.split('-').map(Number);
  if (parts.length === 3) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + days);
    return formatToDisplayDate(d);
  }
  return displayDate;
}
