export interface VoiceState {
	recording: boolean;
	requesting: boolean;
	busy: boolean;
	message: string;
}
export interface VoiceDependencies {
	allowed: () => boolean;
	capture: () => Promise<MediaStream>;
	recorder: (stream: MediaStream) => MediaRecorder;
	encode: (blob: Blob) => Promise<string>;
	transcribe: (audio: string, mime: string) => Promise<string>;
	text: (text: string) => void;
	state: (state: VoiceState) => void;
}
const MAX_BYTES = 2_500_000;
const PRIVACY = 'Recording stopped for privacy. Your typed observations are still here.';
const FAILED = 'Could not record or transcribe the clip. Try again or type your observations.';

/** One in-memory clip. Cancellation invalidates every pending stage before releasing the mic. */
export class VoiceCapture {
	private revision = 0;
	private alive = true;
	private active:
		| { stream: MediaStream; recorder: MediaRecorder; timer?: ReturnType<typeof setTimeout> }
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
	private release() {
		const active = this.active;
		this.active = undefined;
		if (!active) return;
		clearTimeout(active.timer);
		active.recorder.ondataavailable = null;
		active.recorder.onstop = null;
		active.recorder.onerror = null;
		try {
			if (active.recorder.state !== 'inactive') active.recorder.stop();
		} catch {
			/* Release tracks too. */
		}
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
	stop() {
		try {
			this.active?.recorder.stop();
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
			const recorder = this.deps.recorder(stream);
			const active = {
				stream,
				recorder,
				timer: undefined as ReturnType<typeof setTimeout> | undefined
			};
			this.active = active;
			const chunks: Blob[] = [];
			let size = 0;
			recorder.ondataavailable = (event) => {
				if (!this.current(mine)) return;
				size += event.data.size;
				if (size > MAX_BYTES) {
					this.cancel(FAILED);
					return;
				}
				if (event.data.size) chunks.push(event.data);
			};
			recorder.onerror = () => {
				if (mine === this.revision) this.cancel(FAILED);
			};
			recorder.onstop = () => {
				if (this.active !== active || mine !== this.revision) return;
				this.release();
				if (!this.current(mine)) return;
				this.update({ recording: false, busy: true });
				void this.finish(mine, new Blob(chunks, { type: recorder.mimeType }));
			};
			recorder.start(1000);
			this.update({ requesting: false, recording: true });
			active.timer = setTimeout(() => this.stop(), Math.min(55, Math.max(1, seconds)) * 1000);
		} catch {
			stream?.getTracks().forEach((track) => track.stop());
			if (mine === this.revision) this.cancel(FAILED);
		} finally {
			if (mine === this.revision) this.update({ requesting: false });
		}
	}
	private async finish(mine: number, blob: Blob) {
		try {
			if (!blob.size || blob.size > MAX_BYTES) throw new Error('Clip unavailable');
			const audio = await this.deps.encode(blob);
			if (!this.current(mine)) return;
			const text = await this.deps.transcribe(audio, blob.type.split(';')[0]);
			if (this.current(mine) && text.trim()) this.deps.text(text.trim());
		} catch {
			if (this.current(mine)) this.update({ message: FAILED });
		} finally {
			if (mine === this.revision) this.update({ busy: false });
		}
	}
}
