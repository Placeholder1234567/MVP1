// Photos on the home board (frontend-audit.md finding 19, fix 3). The device
// shrinks and re-encodes every photo as JPEG before upload; the server keeps
// only JPEGs and drops metadata segments, so no camera location (EXIF GPS)
// or device details are ever stored.

/** Longest side after the device shrinks the photo. */
export const PHOTO_MAX_EDGE = 1600;
/** Upload limit after shrinking (a 1600 px JPEG at quality 0.8 is far smaller). */
export const PHOTO_MAX_BYTES = 1_500_000;

/** Width and height that fit within PHOTO_MAX_EDGE, keeping the shape. */
export function fitPhoto(width: number, height: number): { width: number; height: number } {
	const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height, 1));
	return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const isJpeg = (b: Uint8Array) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/**
 * The JPEG without APP1-APP15 and comment segments (EXIF, XMP, ICC, maker
 * notes), keeping the image data. Null if it isn't a well-formed JPEG.
 */
export function stripJpegMetadata(input: Uint8Array): Uint8Array | null {
	if (!isJpeg(input)) return null;
	const out: number[] = [0xff, 0xd8];
	let i = 2;
	while (i + 4 <= input.length) {
		if (input[i] !== 0xff) return null;
		const marker = input[i + 1];
		// Start of scan: the rest is image data.
		if (marker === 0xda) {
			for (let j = i; j < input.length; j++) out.push(input[j]);
			return Uint8Array.from(out);
		}
		const length = (input[i + 2] << 8) | input[i + 3];
		if (length < 2 || i + 2 + length > input.length) return null;
		const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
		if (!metadata) for (let j = i; j < i + 2 + length; j++) out.push(input[j]);
		i += 2 + length;
	}
	return null;
}
