import { describe, expect, it } from 'vitest';
import { PdfUnsupportedText, renderPdf } from '../../../src/lib/server/pdf';
import type { PdfReport } from '../../../src/lib/domain/report-pdf';

const doc = (value: string, records = 1): PdfReport => ({
	title: 'Care records: notes',
	intro: ['2026-10-01 through 2026-10-07 (inclusive), UTC'],
	sections: [
		{
			records: Array.from({ length: records }, (_, i) => ({
				heading: `Record ${i + 1}`,
				fields: [
					['Author', 'José Ñúñez, Łukasz Wiśniewski'],
					['Body', value]
				]
			}))
		}
	],
	empty: 'No records in this period.'
});
const pages = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;

describe('PDF rendering', () => {
	it('draws a Letter PDF with embedded Figtree and a page footer', async () => {
		const pdf = await renderPdf(doc('Ate lunch with staff.\nWalked to the park.'));
		const raw = pdf.toString('latin1');
		expect(raw.startsWith('%PDF-')).toBe(true);
		expect(raw).toContain('/MediaBox [0 0 612 792]');
		expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Figtree-Regular/);
		expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Figtree-SemiBold/);
		expect(pages(pdf)).toBe(1);
	});

	it('flows long reports and long values across pages', async () => {
		expect(pages(await renderPdf(doc('Short.', 60)))).toBeGreaterThan(1);
		expect(pages(await renderPdf(doc('Long note. '.repeat(2000))))).toBeGreaterThan(1);
	});

	it('draws an empty report', async () => {
		const pdf = await renderPdf({ ...doc(''), sections: [{ records: [] }] });
		expect(pages(pdf)).toBe(1);
	});

	it('checks agency identification text with the same fail-closed glyph validation', async () => {
		await expect(
			renderPdf({ ...doc('Short.'), intro: ['Current agency name at generation: አበበ'] })
		).rejects.toBeInstanceOf(PdfUnsupportedText);
		const pdf = await renderPdf({
			...doc('Short.'),
			intro: ['Current agency name at generation: Synthetic Care Agency']
		});
		expect(pages(pdf)).toBe(1);
	});

	it('embeds a complete Noto Sans family for Greek, Cyrillic and extended Latin', async () => {
		const report = doc('Анна · Ελληνικά · Nguyễn · Nguye\u0302\u0303n');
		report.title = 'Care records: Ελληνικά';
		report.intro.push('Current agency name at generation: Анна Care');
		report.sections[0].records[0].heading = 'Nguyễn';
		const raw = (await renderPdf(report)).toString('latin1');
		expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
		expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-SemiBold/);
		expect(pages(await renderPdf(report))).toBe(1);
		expect(pages(await renderPdf(doc('Анна Nguyễn Ελληνικά '.repeat(2000))))).toBeGreaterThan(1);
	});

	it('refuses text the font cannot show instead of drawing blank boxes', async () => {
		for (const text of ['አበበ', '李', 'العربية', '🙂'])
			await expect(renderPdf(doc(text))).rejects.toBeInstanceOf(PdfUnsupportedText);
	});
});
