// Draws a PdfReport (domain/report-pdf.ts) as a Letter-size PDF in Figtree,
// the app's typeface (design-system.md). pdfkit, fontkit and the fonts load on
// first use, so modules that only import this (the job registry, which
// scripts/cloud-jobs.ts runs through tsx) don't pull them in.
//
// Figtree remains the default. Noto Sans adds Greek, Cyrillic and extended
// Latin when the complete report fits both of its faces. A report outside
// both families is refused, retaining the CSV/HTML fallback without boxes.
import type { PdfReport } from '../domain/report-pdf';
import { pdfText } from '../domain/report-pdf';

export class PdfUnsupportedText extends Error {
	constructor() {
		super('Report text needs characters the PDF font does not include');
		this.name = 'PdfUnsupportedText';
	}
}

const INK = '#1c1b4b';
const MUTED = '#5a5880';
const LINE = '#daddf3';
const MARGIN = 54;
const FOOTER = 36;
const LABEL_WIDTH = 150;
const GAP = 12;

let fonts: Promise<{ regular: Buffer; semibold: Buffer }> | undefined;
function loadFonts() {
	return (fonts ??= (async () => {
		const [regular, semibold] = await Promise.all([
			import('./fonts/Figtree-Regular.ttf?inline'),
			import('./fonts/Figtree-SemiBold.ttf?inline')
		]);
		const bytes = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
		return { regular: bytes(regular.default), semibold: bytes(semibold.default) };
	})());
}

let fallbackFonts: Promise<{ regular: Buffer; semibold: Buffer }> | undefined;
function loadFallbackFonts() {
	return (fallbackFonts ??= (async () => {
		const [regular, semibold] = await Promise.all([
			import('./fonts/noto-sans/NotoSans-Regular.ttf?inline'),
			import('./fonts/noto-sans/NotoSans-SemiBold.ttf?inline')
		]);
		const bytes = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
		return { regular: bytes(regular.default), semibold: bytes(semibold.default) };
	})());
}

export async function renderPdf(report: PdfReport): Promise<Buffer> {
	const [{ default: PDFDocument }, fontkit, primary] = await Promise.all([
		import('pdfkit'),
		import('fontkit'),
		loadFonts()
	]);
	const text = [...pdfText(report)];
	const covers = (family: { regular: Buffer; semibold: Buffer }) => {
		const faces = [family.regular, family.semibold].map(
			(bytes) => fontkit.create(bytes) as import('fontkit').Font
		);
		return text.every((line) =>
			[...line].every(
				(ch) =>
					/\s/.test(ch) || faces.every((face) => face.hasGlyphForCodePoint(ch.codePointAt(0)!))
			)
		);
	};
	let selected = primary;
	if (!covers(primary)) {
		selected = await loadFallbackFonts();
		if (!covers(selected)) throw new PdfUnsupportedText();
	}
	const { regular, semibold } = selected;

	const doc = new PDFDocument({
		size: 'LETTER',
		margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + FOOTER },
		bufferPages: true,
		lang: 'en-US',
		displayTitle: true,
		info: { Title: report.title, Creator: 'Guad', Producer: 'Guad' }
	});
	const chunks: Buffer[] = [];
	doc.on('data', (c: Buffer) => chunks.push(c));
	const done = new Promise<Buffer>((resolve, reject) => {
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
	});
	doc.registerFont('R', regular);
	doc.registerFont('B', semibold);

	const left = MARGIN;
	const width = doc.page.width - MARGIN * 2;
	const valueX = left + LABEL_WIDTH + GAP;
	const valueWidth = width - LABEL_WIDTH - GAP;
	const bottom = () => doc.page.height - doc.page.margins.bottom;
	const room = (needed: number) => {
		if (doc.y + needed > bottom()) doc.addPage();
	};

	doc.font('B').fontSize(18).fillColor(INK).text(report.title, left, doc.y, { width });
	doc.moveDown(0.4);
	doc.font('R').fontSize(10).fillColor(MUTED);
	for (const line of report.intro) doc.text(line, left, doc.y, { width }).moveDown(0.2);

	const records = report.sections.reduce((n, s) => n + s.records.length, 0);
	if (!records) doc.moveDown(1).font('R').fontSize(11).fillColor(INK).text(report.empty, left);
	for (const section of report.sections) {
		if (section.heading) {
			room(60);
			doc.moveDown(1).font('B').fontSize(14).fillColor(INK).text(section.heading, left, doc.y, {
				width
			});
		}
		for (const rec of section.records) {
			// Keep a record's heading with its first field.
			room(48);
			doc.moveDown(0.8);
			const top = doc.y;
			doc
				.moveTo(left, top)
				.lineTo(left + width, top)
				.lineWidth(0.75)
				.strokeColor(LINE)
				.stroke();
			doc
				.font('B')
				.fontSize(11.5)
				.fillColor(INK)
				.text(rec.heading, left, top + 6, { width });
			doc.moveDown(0.3);
			doc.fontSize(9.5);
			for (const [label, raw] of rec.fields) {
				const value = raw.replaceAll('\r', '') || '—';
				const labelHeight = doc.font('B').heightOfString(label, { width: LABEL_WIDTH });
				const valueHeight = doc.font('R').heightOfString(value, { width: valueWidth });
				const height = Math.max(labelHeight, valueHeight);
				// Pairs that fit on a page stay together; longer values flow on.
				if (height <= bottom() - doc.page.margins.top) room(height);
				else room(labelHeight);
				const y = doc.y;
				doc.font('B').fillColor(MUTED).text(label, left, y, { width: LABEL_WIDTH });
				const afterLabel = { page: doc.bufferedPageRange().count, y: doc.y };
				doc.font('R').fillColor(INK).text(value, valueX, y, { width: valueWidth });
				// The value may have flowed onto a new page; continue below whichever ends lower.
				if (doc.bufferedPageRange().count === afterLabel.page)
					doc.y = Math.max(doc.y, afterLabel.y);
				doc.x = left;
				doc.moveDown(0.25);
			}
		}
	}

	const { start, count } = doc.bufferedPageRange();
	for (let i = start; i < start + count; i++) {
		doc.switchToPage(i);
		// Writing inside the bottom margin would otherwise start a new page.
		const margin = doc.page.margins.bottom;
		doc.page.margins.bottom = 0;
		doc
			.font('R')
			.fontSize(8.5)
			.fillColor(MUTED)
			.text(
				`Confidential care information · Page ${i - start + 1} of ${count}`,
				left,
				doc.page.height - MARGIN - 10,
				{ width, align: 'center', lineBreak: false }
			);
		doc.page.margins.bottom = margin;
	}
	doc.end();
	return done;
}
