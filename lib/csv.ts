/**
 * CSV cells that a spreadsheet will not execute (B-006, QA-012).
 *
 * Guest names come from hosts' imports and wishes from anyone holding a link, so a value such as
 * `=HYPERLINK("…")` must open as text. Cells whose first character is `=`, `+`, `-`, `@`, tab or carriage return
 * get a leading apostrophe (OWASP CSV-injection guidance), then every cell is quoted with doubled quotes.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(',');
}
