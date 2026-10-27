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
		onState,
		saveFor
	}: {
		seconds: number;
		label: string;
		disabled?: boolean;
		onText: (text: string) => boolean | void;
		onState?: (state: { recording: boolean; busy: boolean; message: string }) => void;
		/** Offline, keep the recording for this person and note type (pending_recordings). */
		saveFor?: { clientId: string; kind: string };
	} = $props();
	// Groups the parts of one recording kept offline.
	let recordingId = crypto.randomUUID();
	let pendingText = $state('');
	function acceptTranscript(text: string) {
		if (onText(text) === false) pendingText = text;
		else pendingText = '';
	}
	const app = useSession();
	let voiceState = $state<VoiceState>({
		recording: false,
		requesting: false,
		busy: false,
		message: ''
	});
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
			text: acceptTranscript,
			offline: () => !!saveFor && !navigator.onLine,
			keep: async (audio, mime, part) => {
				if (!saveFor || !app.db) throw new Error('Nowhere to keep it');
				await app.db.execute(
					'INSERT INTO pending_recordings (id, profile_id, client_id, kind, recording_id, part, mime, audio, recorded_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?)',
					[
						app.user.profileId,
						saveFor.clientId,
						saveFor.kind,
						recordingId,
						part,
						mime,
						audio,
						new Date().toISOString()
					]
				);
			},
			state: (value) => (voiceState = value),
			// Long recordings are cut into segments at a pause (voice-capture.ts).
			listen: (stream) => {
				const context = new AudioContext();
				const analyser = context.createAnalyser();
				analyser.fftSize = 1024;
				context.createMediaStreamSource(stream).connect(analyser);
				const samples = new Float32Array(analyser.fftSize);
				return {
					quiet: () => {
						analyser.getFloatTimeDomainData(samples);
						let sum = 0;
						for (const v of samples) sum += v * v;
						return Math.sqrt(sum / samples.length) < 0.02;
					},
					close: () => void context.close().catch(() => {})
				};
			}
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
		else if (!disabled && !pendingText) {
			recordingId = crypto.randomUUID();
			void capture?.start(seconds);
		}
	}
</script>

<button
	class="btn sec"
	type="button"
	disabled={(disabled && !voiceState.recording) ||
		voiceState.busy ||
		voiceState.requesting ||
		!!pendingText}
	onclick={speak}
	>{voiceState.recording ? 'Stop recording' : voiceState.busy ? 'Transcribing…' : label}</button
>

{#if pendingText}
	<section class="callout warn stack" aria-label="Transcript not added">
		<p role="alert">
			This transcript does not fit in the observations field. Nothing was added or cut off. Make
			room and add it again, or transfer the words you need manually. Keep this screen open: this
			transcript is only held here until you leave.
		</p>
		<label
			>Full transcript not yet added<textarea class="input" readonly value={pendingText}
			></textarea></label
		>
		<div class="actions">
			<button class="btn sec" type="button" {disabled} onclick={() => acceptTranscript(pendingText)}
				>Add full transcript</button
			>
			<button
				class="textbtn"
				type="button"
				onclick={() => {
					if (
						confirm(
							'Discard this transcript that has not been added? Your existing observations stay unchanged.'
						)
					)
						pendingText = '';
				}}>Discard unadded transcript</button
			>
		</div>
	</section>
{/if}
