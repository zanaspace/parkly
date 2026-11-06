export type CsvCell = string | number | null | undefined;

/** Cells that a spreadsheet would run as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  // Numbers we write ourselves are safe, including negatives.
  if (typeof value === 'number') return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * RFC 4180 CSV for exports people open in Excel or Google Sheets (FR-OPS-002).
 * Text typed by people (lot names, plates) is defused so it can't run as a
 * formula when the file is opened.
 */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => `${r.map(cell).join(',')}\r\n`).join('');
}
