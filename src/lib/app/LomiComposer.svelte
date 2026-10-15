<script lang="ts">
	import { onMount } from 'svelte';
	import { useSession } from './session.svelte';
	import { trpc } from '#lib/trpc.ts';
	import { draftLocally, type DraftResult, type NoteKind } from '#lib/domain/lomi.ts';
	let {
		clientId,
		type,
		onDraft
	}: { clientId: string; type: NoteKind; onDraft: (result: DraftResult) => void } = $props();
	let text = $state('');
	let busy = $state(false);
	let recording = $state(false);
	let voice = $state(false);
	let message = $state('');
	let preview = $state<DraftResult | null>(null);
	let recorder: MediaRecorder | undefined;
	let stream: MediaStream | undefined;
	let limit: ReturnType<typeof setTimeout> | undefined;
	let alive = true;
	let recordingRevision = 0;
	const app = useSession();
	function stopForPrivacy() {
		recordingRevision++;
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
			if (!document.hidden) return;
			stopForPrivacy();
		};
		document.addEventListener('visibilitychange', hide);
		void trpc.lomi.capabilities
			.query()
			.then((c) => (voice = c.voice))
			.catch(() => {});
		return () => {
			document.removeEventListener('visibilitychange', hide);
			alive = false;
			clearTimeout(limit);
			if (recorder?.state === 'recording') recorder.stop();
			stream?.getTracks().forEach((t) => t.stop());
		};
	});
	async function draft() {
		if (!text.trim() || busy) return;
		busy = true;
		message = '';
		try {
			preview = await trpc.lomi.draft.mutate({ clientId, type, prompt: text });
		} catch {
			preview = draftLocally(text, type);
		} finally {
			busy = false;
		}
	}
	async function speak() {
		if (recording) {
			recorder?.stop();
			return;
		}
		message = '';
		preview = null;
		const revision = ++recordingRevision;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (!alive || document.hidden || app.privacyLocked || revision !== recordingRevision) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
				MediaRecorder.isTypeSupported(t)
			);
			if (!mime) {
				stream.getTracks().forEach((t) => t.stop());
				message =
					'This browser cannot record a supported audio format. Type your observations below.';
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
				if (!alive || revision !== recordingRevision) return;
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
					if (alive) text = [text, result.text].filter(Boolean).join(' ').slice(0, 8000);
				} catch {
					if (alive)
						message = 'Could not transcribe the clip. Try again or type your observations.';
				} finally {
					busy = false;
				}
			};
			recorder.start();
			recording = true;
			limit = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 55000);
		} catch {
			stream?.getTracks().forEach((t) => t.stop());
			message = 'Microphone access is unavailable. You can type your observations instead.';
		}
	}
</script>

<section class="card pad stack lomi-panel" aria-label="Lomi drafting assistant">
	<div class="spread">
		<div>
			<p class="eyebrow">A little help from Lomi</p>
			<h2>Tell the story of your shift.</h2>
		</div>
		<span class="lemon-orb" aria-hidden="true">◒</span>
	</div>
	<p class="muted">Use your own words. Lomi helps organize them, and you review every section.</p>
	<label
		>Your observations<textarea
			class="input"
			maxlength="8000"
			bind:value={text}
			disabled={busy || recording}
			placeholder="What happened, what support did you provide, and how did the person respond?"
		></textarea></label
	>
	<div class="actions">
		{#if voice}<button class="btn sec" type="button" disabled={busy} onclick={speak}
				>{recording ? 'Stop recording' : 'Speak · up to 55 seconds'}</button
			>{/if}<button
			class="btn"
			type="button"
			disabled={busy || recording || !text.trim()}
			onclick={draft}>{busy ? 'Working…' : 'Prepare a draft'}</button
		>
	</div>
	{#if recording}<p role="status">Recording. Stops automatically after 55 seconds.</p>{/if}
	{#if !voice}<p class="muted">
			Voice will be available once your agency connects transcription. You can type here now.
		</p>{/if}
	{#if message}<p role="status">{message}</p>{/if}
	{#if preview}<div class="stack">
			<p class="callout warn">
				{preview.fallback
					? 'Lomi is using simple sorting. These are your original words; review the sections carefully.'
					: 'AI-generated draft. Check every section against what actually happened.'}
			</p>
			{#each Object.entries(preview.content) as [section, value] (section)}{#if value}<div>
						<b>{section}</b>
						<p class="record-text">{value}</p>
					</div>{/if}{/each}
			{#each preview.flags as flag (flag.phrase)}<p class="callout warn">
					“{flag.phrase}”: {flag.tip}
				</p>{/each}
			{#if preview.incident.detected}<p class="callout bad">
					This description may need a separate incident report. Follow your agency’s reporting
					procedure.
				</p>{/if}
			<button
				class="btn sec"
				type="button"
				onclick={() => {
					if (preview) {
						onDraft(preview);
						preview = null;
						text = '';
					}
				}}>Use this draft in my note</button
			>
			<p class="muted">This replaces the note sections below. Your goal scores remain unchanged.</p>
		</div>{/if}
</section>

<style>
	.lomi-panel {
		border-color: #f2d27a;
	}
	.lemon-orb {
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		background: var(--lemon);
		color: var(--ink);
		border-radius: 50%;
		font-size: 38px;
	}
</style>
