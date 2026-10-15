/** Quoted CSV cells; neutralize spreadsheet formulas in user-authored text. */
export function csvCell(value: string | number | null | undefined): string {
	let text = value == null ? '' : String(value);
	if (typeof value === 'string' && /^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
	return '"' + text.replaceAll('"', '""') + '"';
}
export const csvRows = (rows: Array<Array<string | number | null | undefined>>) =>
	rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
