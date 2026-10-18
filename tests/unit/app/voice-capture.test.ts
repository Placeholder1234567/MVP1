import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	KEPT_OFFLINE,
	MISSING_PART,
	VoiceCapture,
	type VoiceDependencies,
	type VoiceState
} from '../../../src/lib/app/voice-capture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fakeRecorder() {
	const recorder = {
		state: 'inactive',
		mimeType: 'audio/webm;codecs=opus',
		ondataavailable: null as ((event: { data: Blob }) => void) | null,
		onstop: null as (() => void) | null,
		onerror: null as (() => void) | null,
		start: vi.fn(() => {
			recorder.state = 'recording';
		}),
		stop: vi.fn(() => {
			recorder.state = 'inactive';
			recorder.onstop?.();
		})
	};
	return recorder;
}
function fixture(listener?: { quiet: () => boolean; close: () => void }) {
	const track = { stop: vi.fn() };
	const stream = { getTracks: () => [track] } as unknown as MediaStream;
	const recorders: ReturnType<typeof fakeRecorder>[] = [];
	const deps = {
		allowed: vi.fn(() => true),
		capture: vi.fn(async () => stream),
		recorder: vi.fn(() => {
			const r = fakeRecorder();
			recorders.push(r);
			return r as unknown as MediaRecorder;
		}),
		encode: vi.fn<VoiceDependencies['encode']>(async () => 'synthetic-audio'),
		transcribe: vi.fn<VoiceDependencies['transcribe']>(async () => ' Synthetic observation. '),
		text: vi.fn(),
		state: vi.fn<(state: VoiceState) => void>(),
		...(listener ? { listen: vi.fn(() => listener) } : {})
	};
	const capture = new VoiceCapture(deps);
	return {
		capture,
		deps,
		recorders,
		/** The segment being recorded now. */
		get recorder() {
			return recorders[recorders.length - 1];
		},
		stream,
		track,
		data: (size = 8) =>
			recorders[recorders.length - 1].ondataavailable?.({ data: new Blob([new Uint8Array(size)]) })
	};
}
it('records one clip, releases the microphone, and returns only reviewed text to the parent', async () => {
	const f = fixture();
	await f.capture.start(30);
	f.data();
	await vi.advanceTimersByTimeAsync(30_000);
	expect(f.recorder.start).toHaveBeenCalledWith(1000);
	expect(f.recorders).toHaveLength(1);
	expect(f.track.stop).toHaveBeenCalled();
	expect(f.deps.transcribe).toHaveBeenCalledWith('synthetic-audio', 'audio/webm');
	expect(f.deps.text).toHaveBeenCalledExactlyOnceWith('Synthetic observation.');
	expect(f.deps.state).toHaveBeenLastCalledWith(
		expect.objectContaining({ busy: false, recording: false })
	);
	f.capture.dispose();
});
it('splits a long recording into segments of at most 55 s and joins the text in order', async () => {
	const f = fixture();
	let n = 0;
	f.deps.transcribe.mockImplementation(async () => `Part ${++n}.`);
	await f.capture.start(400);
	for (let second = 0; second < 300; second += 5) {
		f.data();
		await vi.advanceTimersByTimeAsync(5_000);
	}
	// Five minutes at most: 55 s segments, the last one cut by the total limit.
	expect(f.recorders).toHaveLength(6);
	expect(f.track.stop).toHaveBeenCalledTimes(1);
	expect(f.deps.text).toHaveBeenCalledExactlyOnceWith(
		'Part 1. Part 2. Part 3. Part 4. Part 5. Part 6.'
	);
	// The next segment starts before the previous one stops: no gap.
	expect(f.recorders[1].start.mock.invocationCallOrder[0]).toBeLessThan(
		f.recorders[0].stop.mock.invocationCallOrder[0]
	);
	expect(vi.getTimerCount()).toBe(0);
	f.capture.dispose();
});
it('cuts a segment at the first pause after 40 s', async () => {
	let quiet = false;
	const close = vi.fn();
	const f = fixture({ quiet: () => quiet, close });
	await f.capture.start(300);
	f.data();
	await vi.advanceTimersByTimeAsync(42_000);
	expect(f.recorders).toHaveLength(1);
	quiet = true;
	await vi.advanceTimersByTimeAsync(250);
	expect(f.recorders).toHaveLength(2);
	quiet = false;
	f.data();
	f.capture.stop();
	await vi.advanceTimersByTimeAsync(0);
	expect(close).toHaveBeenCalled();
	expect(f.deps.transcribe).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
	f.capture.dispose();
});
it('marks a part that could not be transcribed instead of dropping it silently', async () => {
	const f = fixture();
	f.deps.transcribe
		.mockResolvedValueOnce('First part.')
		.mockRejectedValueOnce(new Error('provider'))
		.mockResolvedValueOnce('Last part.');
	await f.capture.start(300);
	for (let i = 0; i < 3; i++) {
		f.data();
		if (i < 2) await vi.advanceTimersByTimeAsync(55_000);
	}
	f.capture.stop();
	await vi.advanceTimersByTimeAsync(0);
	expect(f.deps.text).toHaveBeenCalledExactlyOnceWith(`First part. ${MISSING_PART} Last part.`);
	expect(f.deps.state).toHaveBeenLastCalledWith(
		expect.objectContaining({ busy: false, message: expect.stringContaining('marked in the text') })
	);
	f.capture.dispose();
});
it('cancelling a long recording mid-segment leaves no timers and sends no text', async () => {
	const f = fixture({ quiet: () => false, close: vi.fn() });
	await f.capture.start(300);
	f.data();
	await vi.advanceTimersByTimeAsync(60_000);
	f.data();
	f.capture.cancel();
	await vi.runAllTimersAsync();
	expect(vi.getTimerCount()).toBe(0);
	expect(f.deps.text).not.toHaveBeenCalled();
	expect(f.track.stop).toHaveBeenCalled();
	f.capture.dispose();
});
it('does not capture while locked and releases permission grants arriving after cancellation', async () => {
	const f = fixture();
	f.deps.allowed.mockReturnValue(false);
	await f.capture.start(30);
	expect(f.deps.capture).not.toHaveBeenCalled();
	f.deps.allowed.mockReturnValue(true);
	let grant!: (stream: MediaStream) => void;
	f.deps.capture.mockReturnValue(new Promise((resolve) => (grant = resolve)));
	const pending = f.capture.start(30);
	f.capture.cancel();
	grant(f.stream);
	await pending;
	expect(f.track.stop).toHaveBeenCalled();
	expect(f.deps.recorder).not.toHaveBeenCalled();
	f.capture.dispose();
});
it('drops captured audio on privacy cancellation without requesting transcription', async () => {
	const f = fixture();
	await f.capture.start(30);
	f.data();
	f.capture.cancel();
	await vi.runAllTimersAsync();
	expect(f.track.stop).toHaveBeenCalled();
	expect(f.deps.encode).not.toHaveBeenCalled();
	expect(f.deps.transcribe).not.toHaveBeenCalled();
	expect(f.deps.text).not.toHaveBeenCalled();
	f.capture.dispose();
});
it('does not send audio when encoding completes after privacy lock', async () => {
	const f = fixture();
	let encoded!: (value: string) => void;
	f.deps.encode.mockReturnValue(new Promise((resolve) => (encoded = resolve)));
	await f.capture.start(30);
	f.data();
	f.capture.stop();
	f.capture.cancel();
	encoded('late-audio');
	await vi.runAllTimersAsync();
	expect(f.deps.transcribe).not.toHaveBeenCalled();
	f.capture.dispose();
});
it('ignores late transcripts after cancellation and permits a fresh recording', async () => {
	const f = fixture();
	let transcript!: (value: string) => void;
	f.deps.transcribe.mockReturnValueOnce(new Promise((resolve) => (transcript = resolve)));
	await f.capture.start(30);
	f.data();
	f.capture.stop();
	await vi.advanceTimersByTimeAsync(0);
	f.capture.cancel();
	await f.capture.start(30);
	transcript('Late transcript');
	await vi.advanceTimersByTimeAsync(0);
	expect(f.deps.text).not.toHaveBeenCalled();
	expect(f.deps.state).toHaveBeenLastCalledWith(expect.objectContaining({ recording: true }));
	f.capture.dispose();
});
it('releases resources and avoids upload on recorder failure, empty clips and oversized chunks', async () => {
	for (const failure of ['error', 'empty', 'large'] as const) {
		const f = fixture();
		await f.capture.start(30);
		if (failure === 'error') f.recorder.onerror?.();
		else if (failure === 'large') f.data(2_500_001);
		else f.capture.stop();
		await vi.advanceTimersByTimeAsync(0);
		expect(f.track.stop).toHaveBeenCalled();
		expect(f.deps.transcribe).not.toHaveBeenCalled();
		expect(f.deps.state).toHaveBeenLastCalledWith(
			expect.objectContaining({ recording: false, busy: false, message: expect.any(String) })
		);
		f.capture.dispose();
	}
});
it('disposal suppresses late callbacks and safely handles unavailable recorder construction', async () => {
	const f = fixture();
	f.deps.recorder.mockImplementationOnce(() => {
		throw new Error('Synthetic unsupported format');
	});
	await f.capture.start(30);
	expect(f.track.stop).toHaveBeenCalled();
	f.capture.dispose();
	const calls = f.deps.state.mock.calls.length;
	await f.capture.start(30);
	expect(f.deps.state).toHaveBeenCalledTimes(calls);
});

it('a queued stop from an abandoned recording cannot close a newer recording', async () => {
	const f = fixture();
	await f.capture.start(30);
	const abandonedStop = f.recorder.onstop;
	f.capture.cancel();
	await f.capture.start(30);
	const stopped = f.track.stop.mock.calls.length;
	abandonedStop?.();
	expect(f.track.stop).toHaveBeenCalledTimes(stopped);
	expect(f.deps.state).toHaveBeenLastCalledWith(expect.objectContaining({ recording: true }));
	expect(f.deps.transcribe).not.toHaveBeenCalled();
	f.capture.dispose();
});

it('offline, keeps each part on the device for later instead of losing the recording', async () => {
	const f = fixture();
	const kept: [string, string, number][] = [];
	const deps = f.deps as VoiceDependencies;
	deps.offline = () => true;
	deps.keep = async (audio, mime, part) => void kept.push([audio, mime, part]);
	await f.capture.start(400);
	f.data();
	await vi.advanceTimersByTimeAsync(55_000);
	f.data();
	f.capture.stop();
	await vi.advanceTimersByTimeAsync(0);
	expect(kept).toEqual([
		['synthetic-audio', 'audio/webm', 0],
		['synthetic-audio', 'audio/webm', 1]
	]);
	expect(f.deps.transcribe).not.toHaveBeenCalled();
	expect(f.deps.text).not.toHaveBeenCalled();
	expect(f.deps.state).toHaveBeenLastCalledWith(
		expect.objectContaining({ busy: false, message: KEPT_OFFLINE })
	);
	f.capture.dispose();
});

it('keeps a part whose upload fails because the connection just dropped', async () => {
	const f = fixture();
	let online = true;
	const deps = f.deps as VoiceDependencies;
	deps.offline = () => !online;
	const keep = vi.fn(async () => {});
	deps.keep = keep;
	f.deps.transcribe.mockImplementation(async () => {
		online = false;
		throw new Error('Network');
	});
	await f.capture.start(30);
	f.data();
	await vi.advanceTimersByTimeAsync(30_000);
	expect(keep).toHaveBeenCalledWith('synthetic-audio', 'audio/webm', 0);
	expect(f.deps.state).toHaveBeenLastCalledWith(expect.objectContaining({ message: KEPT_OFFLINE }));
	f.capture.dispose();
});

it('online, a failed transcription is not kept', async () => {
	const f = fixture();
	const deps = f.deps as VoiceDependencies;
	deps.offline = () => false;
	const keep = vi.fn(async () => {});
	deps.keep = keep;
	f.deps.transcribe.mockRejectedValue(new Error('Server'));
	await f.capture.start(30);
	f.data();
	await vi.advanceTimersByTimeAsync(30_000);
	expect(keep).not.toHaveBeenCalled();
	f.capture.dispose();
});
