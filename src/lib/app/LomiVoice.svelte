<script lang="ts">
	import { onMount } from 'svelte';
	import { useSession } from './session.svelte';
	import { VoiceCapture, type VoiceState } from './voice-capture';
	import { trpc } from '#lib/trpc.ts';
	let {
		seconds,
		label,
		disabled = false,
		onText,
		onState
	}: {
		seconds: number;
		label: string;
		disabled?: boolean;
		onText: (text: string) => void;
		onState?: (state: { recording: boolean; busy: boolean; message: string }) => void;
	} = $props();
	const app = useSession();
	let voiceState = $state<VoiceState>({ recording: false, requesting: false, busy: false, message: '' });
	let capture = $state.raw<VoiceCapture>();
	$effect(() => {
		onState?.({
			recording: voiceState.recording,
			busy: voiceState.busy || voiceState.requesting,
			message: voiceState.message
		});
	});
	$effect(() => {
		if (app.privacyLocked) capture?.cancel();
	});
	onMount(() => {
		capture = new VoiceCapture({
			allowed: () => !document.hidden && !app.privacyLocked,
			capture: () => navigator.mediaDevices.getUserMedia({ audio: true }),
			recorder: (stream) => {
				const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) =>
					MediaRecorder.isTypeSupported(type)
				);
				if (!mime) throw new Error('Recording unavailable');
				return new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
			},
			encode: (blob) =>
				new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onerror = () => reject(new Error('Recording unavailable'));
					reader.onabort = () => reject(new Error('Recording unavailable'));
					reader.onload = () => resolve(String(reader.result).split(',')[1]);
					reader.readAsDataURL(blob);
				}),
			transcribe: async (audio, mime) =>
				(
					await trpc.lomi.transcribe.mutate({
						audio,
						mimeType: mime as 'audio/webm' | 'audio/mp4' | 'audio/ogg'
					})
				).text,
			text: (text) => onText(text),
			state: (value) => (voiceState = value)
		});
		const hide = () => {
			if (document.hidden) capture?.cancel();
		};
		const leave = () => capture?.cancel();
		document.addEventListener('visibilitychange', hide);
		window.addEventListener('pagehide', leave);
		return () => {
			document.removeEventListener('visibilitychange', hide);
			window.removeEventListener('pagehide', leave);
			capture?.dispose();
		};
	});
	function speak() {
		if (voiceState.recording) capture?.stop();
		else if (!disabled) void capture?.start(seconds);
	}
</script>

<button
	class="btn sec"
	type="button"
	disabled={(disabled && !voiceState.recording) || voiceState.busy || voiceState.requesting}
	onclick={speak}
	>{voiceState.recording ? 'Stop recording' : voiceState.busy ? 'Transcribing…' : label}</button
>
