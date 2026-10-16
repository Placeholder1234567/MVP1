<script lang="ts">
	// One bounded voice clip -> Speech-to-Text -> plain text handed to the parent.
	// The text is only ever added to a field the caregiver then reviews; nothing
	// here drafts, applies or saves. Recording stops on privacy lock or when the
	// page is hidden, and late transcripts after that are dropped.
	import { onMount } from 'svelte';
	import { useSession } from './session.svelte';
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
	let recording = $state(false);
	let requesting = $state(false);
	let busy = $state(false);
	let message = $state('');
	let recorder: MediaRecorder | undefined;
	let stream: MediaStream | undefined;
	let limit: ReturnType<typeof setTimeout> | undefined;
	let alive = true;
	let revision = 0;
	$effect(() => {
		onState?.({ recording, busy: busy || requesting, message });
	});
	function stopForPrivacy() {
		revision++;
		if (recorder?.state === 'recording') {
			recorder.stop();
			message = 'Recording stopped for privacy. Your typed observations are still here.';
		}
		stream?.getTracks().forEach((track) => track.stop());
	}
	$effect(() => {
		if (app.privacyLocked) stopForPrivacy();
	});
	onMount(() => {
		const hide = () => {
			if (document.hidden) stopForPrivacy();
		};
		document.addEventListener('visibilitychange', hide);
		return () => {
			document.removeEventListener('visibilitychange', hide);
			alive = false;
			clearTimeout(limit);
			if (recorder?.state === 'recording') recorder.stop();
			stream?.getTracks().forEach((t) => t.stop());
		};
	});
	async function speak() {
		if (requesting || busy || app.privacyLocked) return;
		if (recording) {
			recorder?.stop();
			return;
		}
		message = '';
		const mine = ++revision;
		requesting = true;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (!alive || document.hidden || app.privacyLocked || mine !== revision) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
				MediaRecorder.isTypeSupported(t)
			);
			if (!mime) {
				stream.getTracks().forEach((t) => t.stop());
				message = 'This browser cannot record a supported audio format. Type your observations.';
				return;
			}
			recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
			const chunks: Blob[] = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size) chunks.push(e.data);
			};
			recorder.onstop = async () => {
				clearTimeout(limit);
				stream?.getTracks().forEach((t) => t.stop());
				recording = false;
				if (!alive || mine !== revision) return;
				busy = true;
				try {
					const blob = new Blob(chunks, { type: mime });
					if (blob.size > 2500000) throw new Error('Recording too large');
					const audio = await new Promise<string>((resolve, reject) => {
						const reader = new FileReader();
						reader.onerror = () => reject(new Error('Recording unavailable'));
						reader.onload = () => resolve(String(reader.result).split(',')[1]);
						reader.readAsDataURL(blob);
					});
					const result = await trpc.lomi.transcribe.mutate({
						audio,
						mimeType: mime.split(';')[0] as 'audio/webm' | 'audio/mp4' | 'audio/ogg'
					});
					if (alive && mine === revision && !app.privacyLocked && result.text.trim())
						onText(result.text.trim());
				} catch {
					if (alive)
						message = 'Could not transcribe the clip. Try again or type your observations.';
				} finally {
					busy = false;
				}
			};
			recorder.start();
			recording = true;
			limit = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), seconds * 1000);
		} catch {
			stream?.getTracks().forEach((t) => t.stop());
			message = 'Microphone access is unavailable. You can type your observations instead.';
		} finally {
			requesting = false;
		}
	}
</script>

<button
	class="btn sec"
	type="button"
	disabled={(disabled && !recording) || busy || requesting}
	onclick={speak}>{recording ? 'Stop recording' : busy ? 'Transcribing…' : label}</button
>
