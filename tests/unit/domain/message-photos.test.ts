import { describe, expect, it } from 'vitest';
import { fitPhoto, stripJpegMetadata } from '../../../src/lib/domain/message-photos';

const seg = (marker: number, payload: number[]) => [
	0xff,
	marker,
	(payload.length + 2) >> 8,
	(payload.length + 2) & 0xff,
	...payload
];
const exif = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 1, 2, 3]);
const jfif = [...'JFIF'].map((c) => c.charCodeAt(0)).concat([0, 1, 1]);
const scan = [0xff, 0xda, 0, 4, 9, 9, 7, 7, 0xff, 0xd9];

describe('photos', () => {
	it('fits a photo inside 1600 px, keeping its shape and never enlarging it', () => {
		expect(fitPhoto(4032, 3024)).toEqual({ width: 1600, height: 1200 });
		expect(fitPhoto(3024, 4032)).toEqual({ width: 1200, height: 1600 });
		expect(fitPhoto(800, 600)).toEqual({ width: 800, height: 600 });
	});

	it('drops EXIF, XMP and comments but keeps the image data', () => {
		const input = Uint8Array.from([
			0xff,
			0xd8,
			...seg(0xe0, jfif),
			...seg(0xe1, exif),
			...seg(0xfe, [65, 66]),
			...seg(0xdb, [1, 2, 3]),
			...scan
		]);
		expect([...stripJpegMetadata(input)!]).toEqual([
			0xff,
			0xd8,
			...seg(0xe0, jfif),
			...seg(0xdb, [1, 2, 3]),
			...scan
		]);
	});

	it('refuses anything that is not a well-formed JPEG', () => {
		expect(stripJpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBeNull();
		expect(stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 99, 1]))).toBeNull();
		expect(stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2]))).toBeNull();
	});
});
