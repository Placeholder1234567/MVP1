import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	VoiceCapture,
	type VoiceDependencies,
	type VoiceState
} from '../../../src/lib/app/voice-capture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
	const track = { stop: vi.fn() };
	const stream = { getTracks: () => [track] } as unknown as MediaStream;
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
	const deps = {
		allowed: vi.fn(() => true),
		capture: vi.fn(async () => stream),
		recorder: vi.fn(() => recorder as unknown as MediaRecorder),
		encode: vi.fn<VoiceDependencies['encode']>(async () => 'synthetic-audio'),
		transcribe: vi.fn<VoiceDependencies['transcribe']>(async () => ' Synthetic observation. '),
		text: vi.fn(),
		state: vi.fn<(state: VoiceState) => void>()
	};
	const capture = new VoiceCapture(deps);
	return {
		capture,
		deps,
		recorder,
		stream,
		track,
		data: (size = 8) => recorder.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) })
	};
}
it('bounds recording, releases the microphone, and returns only reviewed text to the parent', async () => {
	const f = fixture();
	await f.capture.start(300);
	f.data();
	await vi.advanceTimersByTimeAsync(55_000);
	expect(f.recorder.start).toHaveBeenCalledWith(1000);
	expect(f.track.stop).toHaveBeenCalled();
	expect(f.deps.transcribe).toHaveBeenCalledWith('synthetic-audio', 'audio/webm');
	expect(f.deps.text).toHaveBeenCalledExactlyOnceWith('Synthetic observation.');
	expect(f.deps.state).toHaveBeenLastCalledWith(
		expect.objectContaining({ busy: false, recording: false })
	);
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
