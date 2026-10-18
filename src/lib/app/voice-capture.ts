export interface VoiceState {
	recording: boolean;
	requesting: boolean;
	busy: boolean;
	message: string;
}
/** Loudness probe on the microphone stream, for cutting segments at a pause. */
export interface VoiceListener {
	quiet(): boolean;
	close(): void;
}
export interface VoiceDependencies {
	allowed: () => boolean;
	capture: () => Promise<MediaStream>;
	recorder: (stream: MediaStream) => MediaRecorder;
	encode: (blob: Blob) => Promise<string>;
	transcribe: (audio: string, mime: string) => Promise<string>;
	text: (text: string) => void;
	state: (state: VoiceState) => void;
	/** Optional: without it, segments are cut at the hard limit only. */
	listen?: (stream: MediaStream) => VoiceListener;
}
const MAX_BYTES = 2_500_000;
/** Speech-to-Text's synchronous recognizer takes at most 60 s per request (ai-pipeline.md). */
export const SEGMENT_MAX_SECONDS = 55;
/** After this, the segment ends at the next pause. */
export const SEGMENT_MIN_SECONDS = 40;
/** A brain dump may run to five minutes (ai-pipeline.md "Mode 1"). */
export const RECORDING_MAX_SECONDS = 300;
export const MISSING_PART = '[Part of this recording could not be transcribed.]';
const PRIVACY = 'Recording stopped for privacy. Your typed observations are still here.';
const FAILED = 'Could not record or transcribe the clip. Try again or type your observations.';
const PARTIAL =
	'Part of the recording could not be transcribed; it is marked in the text. Check it before using it.';

interface Segment {
	recorder: MediaRecorder;
	chunks: Blob[];
	size: number;
	timer?: ReturnType<typeof setTimeout>;
	/** Starts pause polling once the segment is long enough. */
	listen?: ReturnType<typeof setTimeout>;
	poll?: ReturnType<typeof setInterval>;
}

/**
 * One recording, in memory. Long recordings are split into segments of at
 * most 55 s on the same microphone stream, cut at a pause where possible;
 * each is transcribed as soon as it ends and the texts are joined in order.
 * Cancellation invalidates every pending stage before releasing the mic.
 */
export class VoiceCapture {
	private revision = 0;
	private alive = true;
	private active:
		| {
				stream: MediaStream;
				segment?: Segment;
				listener?: VoiceListener;
				total?: ReturnType<typeof setTimeout>;
				parts: Promise<string | null>[];
		  }
		| undefined;
	private value: VoiceState = { recording: false, requesting: false, busy: false, message: '' };
	constructor(private deps: VoiceDependencies) {}
	private update(value: Partial<VoiceState>) {
		this.value = { ...this.value, ...value };
		if (this.alive) this.deps.state({ ...this.value });
	}
	private current(revision: number) {
		return this.alive && revision === this.revision && this.deps.allowed();
	}
	private dropSegment(segment: Segment | undefined) {
		if (!segment) return;
		clearTimeout(segment.timer);
		clearTimeout(segment.listen);
		clearInterval(segment.poll);
		segment.recorder.ondataavailable = null;
		segment.recorder.onstop = null;
		segment.recorder.onerror = null;
		try {
			if (segment.recorder.state !== 'inactive') segment.recorder.stop();
		} catch {
			/* Release tracks too. */
		}
	}
	private release() {
		const active = this.active;
		this.active = undefined;
		if (!active) return;
		clearTimeout(active.total);
		this.dropSegment(active.segment);
		active.listener?.close();
		active.stream.getTracks().forEach((track) => track.stop());
	}
	cancel(message = PRIVACY) {
		this.revision++;
		const wasActive = this.value.recording || this.value.requesting || this.value.busy;
		this.release();
		this.update({
			recording: false,
			requesting: false,
			busy: false,
			message: wasActive ? message : this.value.message
		});
	}
	dispose() {
		this.alive = false;
		this.cancel();
	}
	/** Ends the recording; segments already recorded are still transcribed. */
	stop() {
		const segment = this.active?.segment;
		if (!segment) return;
		try {
			this.end(this.revision, segment, true);
		} catch {
			this.cancel(FAILED);
		}
	}
	async start(seconds: number) {
		if (
			!this.alive ||
			!this.deps.allowed() ||
			this.value.recording ||
			this.value.requesting ||
			this.value.busy
		)
			return;
		const mine = ++this.revision;
		this.update({ requesting: true, message: '' });
		let stream: MediaStream | undefined;
		try {
			stream = await this.deps.capture();
			if (!this.current(mine)) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			const active: NonNullable<VoiceCapture['active']> = { stream, parts: [] };
			this.active = active;
			try {
				active.listener = this.deps.listen?.(stream);
			} catch {
				// No pause detection: segments are cut at the hard limit.
			}
			this.segment(mine);
			this.update({ requesting: false, recording: true });
			const limit = Math.min(RECORDING_MAX_SECONDS, Math.max(1, seconds));
			active.total = setTimeout(() => this.stop(), limit * 1000);
		} catch {
			stream?.getTracks().forEach((track) => track.stop());
			if (mine === this.revision) this.cancel(FAILED);
		} finally {
			if (mine === this.revision) this.update({ requesting: false });
		}
	}
	/** Starts a new segment on the open stream. */
	private segment(mine: number) {
		const active = this.active!;
		const segment: Segment = {
			recorder: this.deps.recorder(active.stream),
			chunks: [],
			size: 0
		};
		const { recorder } = segment;
		recorder.ondataavailable = (event) => {
			if (!this.current(mine)) return;
			segment.size += event.data.size;
			if (segment.size > MAX_BYTES) {
				this.cancel(FAILED);
				return;
			}
			if (event.data.size) segment.chunks.push(event.data);
		};
		recorder.onerror = () => {
			if (mine === this.revision) this.cancel(FAILED);
		};
		recorder.start(1000);
		active.segment = segment;
		segment.timer = setTimeout(() => this.end(mine, segment, false), SEGMENT_MAX_SECONDS * 1000);
		if (active.listener)
			segment.listen = setTimeout(() => {
				segment.poll = setInterval(() => {
					if (active.listener?.quiet()) this.end(mine, segment, false);
				}, 250);
			}, SEGMENT_MIN_SECONDS * 1000);
	}
	/**
	 * Ends one segment and queues its transcription. Unless this is the last,
	 * the next segment starts first, so no speech falls in the gap.
	 */
	private end(mine: number, segment: Segment, last: boolean) {
		const active = this.active;
		if (!active || active.segment !== segment || !this.current(mine)) return;
		clearTimeout(segment.timer);
		clearTimeout(segment.listen);
		clearInterval(segment.poll);
		if (!last) this.segment(mine);
		else active.segment = undefined;
		const done = new Promise<Blob>((resolve) => {
			segment.recorder.onstop = () =>
				resolve(new Blob(segment.chunks, { type: segment.recorder.mimeType }));
		});
		segment.recorder.stop();
		active.parts.push(done.then((blob) => this.transcribe(mine, blob)));
		if (!last) return;
		const parts = active.parts;
		this.release();
		this.update({ recording: false, busy: true });
		void this.finish(mine, parts);
	}
	private async transcribe(mine: number, blob: Blob): Promise<string | null> {
		try {
			if (!this.current(mine)) return null;
			if (!blob.size || blob.size > MAX_BYTES) throw new Error('Clip unavailable');
			const audio = await this.deps.encode(blob);
			if (!this.current(mine)) return null;
			return (await this.deps.transcribe(audio, blob.type.split(';')[0])).trim();
		} catch {
			return null;
		}
	}
	private async finish(mine: number, parts: Promise<string | null>[]) {
		try {
			const texts = await Promise.all(parts);
			if (!this.current(mine)) return;
			const heard = texts.filter((t) => t !== null);
			if (!heard.length) throw new Error('Nothing transcribed');
			const text = texts
				.map((t) => (t === null ? MISSING_PART : t))
				.filter(Boolean)
				.join(' ');
			if (text.trim()) this.deps.text(text.trim());
			if (heard.length < texts.length) this.update({ message: PARTIAL });
		} catch {
			if (this.current(mine)) this.update({ message: FAILED });
		} finally {
			if (mine === this.revision) this.update({ busy: false });
		}
	}
}
