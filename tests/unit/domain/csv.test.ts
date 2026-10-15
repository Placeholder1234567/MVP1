import { expect, it } from 'vitest';
import { csvCell, csvRows } from '../../../src/lib/domain/csv';
it('quotes commas, quotes and embedded line breaks', () =>
	expect(csvRows([['A,"B"', 'Line\nTwo']])).toBe('"A,""B""","Line\nTwo"'));
it('neutralizes text formulas while preserving numeric values', () => {
	expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
	expect(csvCell(-2)).toBe('"-2"');
});
