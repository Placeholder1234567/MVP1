<script lang="ts">
	import { onMount } from 'svelte';
	import LomiReview from './LomiReview.svelte';
	import LomiVoice from './LomiVoice.svelte';
	import { RECORDING_MAX_SECONDS } from './voice-capture';
	import { trpc } from '#lib/trpc.ts';
	import { draftLocally, type DraftResult, type NoteKind } from '#lib/domain/lomi.ts';
	import { useSession } from './session.svelte';
	const app = useSession();
	let {
		clientId,
		type,
		onDraft,
		onDirty
	}: {
		clientId: string;
		type: NoteKind;
		onDraft: (result: DraftResult) => void;
		onDirty?: () => void;
	} = $props();
	let text = $state('');
	let busy = $state(false);
	let recording = $state(false);
	let transcribing = $state(false);
	let voice = $state(false);
	let message = $state('');
	let preview = $state<DraftResult | null>(null);
	let voiceMessage = $state('');
	// Seconds recorded so far, for the status line.
	let elapsed = $state(0);
	$effect(() => {
		if (!recording) return;
		elapsed = 0;
		const timer = setInterval(() => elapsed++, 1000);
		return () => clearInterval(timer);
	});
	const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	// Whether voice works is remembered on the device, so the mic is there offline.
	onMount(() => {
		void trpc.lomi.capabilities
			.query()
			.then((c) => {
				voice = c.voice;
				void app.db
					?.execute('INSERT OR REPLACE INTO device_flags (id, value) VALUES (?, ?)', [
						'voice',
						c.voice ? '1' : '0'
					])
					.catch(() => {});
			})
			.catch(() =>
				app.db
					?.getOptional<{ value: string }>('SELECT value FROM device_flags WHERE id = ?', ['voice'])
					.then((row) => (voice = row?.value === '1'))
					.catch(() => {})
			);
	});

	// Recordings kept offline for this person and note type (LomiVoice
	// saveFor): transcribed in order once online, added to the text, deleted.
	let online = $state(typeof navigator === 'undefined' || navigator.onLine);
	let waiting = $state(0);
	let resuming = false;
	type Kept = { id: string; recording_id: string; mime: string; audio: string };
	async function resume() {
		const db = app.db;
		if (!db || resuming) return;
		resuming = true;
		try {
			const rows = await db.getAll<Kept>(
				'SELECT id, recording_id, mime, audio FROM pending_recordings WHERE profile_id = ? AND client_id = ? AND kind = ? ORDER BY recorded_at, recording_id, part',
				[app.user.profileId, clientId, type]
			);
			waiting = new Set(rows.map((r) => r.recording_id)).size;
			if (!online || !rows.length) return;
			for (const recording of [...new Set(rows.map((r) => r.recording_id))]) {
				const parts = rows.filter((r) => r.recording_id === recording);
				const texts: string[] = [];
				for (const part of parts)
					texts.push(
						(
							await trpc.lomi.transcribe.mutate({
								audio: part.audio,
								mimeType: part.mime as 'audio/webm' | 'audio/mp4' | 'audio/ogg'
							})
						).text.trim()
					);
				const clip = texts.filter(Boolean).join(' ');
				if (clip) {
					text = [text, clip].filter(Boolean).join(' ').slice(0, 8000);
					onDirty?.();
				}
				await db.execute('DELETE FROM pending_recordings WHERE recording_id = ?', [recording]);
				waiting--;
				message =
					'Lomi transcribed the recording you saved offline and added it below. Check it before preparing a draft.';
			}
		} catch {
			// Still offline or transcription failed: the recording stays for next time.
		} finally {
			resuming = false;
		}
	}
	$effect(() => {
		void online;
		void app.db;
		void resume();
	});
	async function draft() {
		if (!text.trim() || busy) return;
		busy = true;
		message = '';
		try {
			preview = await trpc.lomi.draft.mutate({ clientId, type, prompt: text });
			onDirty?.();
		} catch {
			preview = draftLocally(text, type);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />
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
			oninput={() => {
				preview = null;
				onDirty?.();
			}}
			disabled={busy || recording || transcribing}
			placeholder="What happened, what support did you provide, and how did the person respond?"
		></textarea></label
	>
	<div class="actions">
		{#if voice}<LomiVoice
				saveFor={{ clientId, kind: type }}
				seconds={RECORDING_MAX_SECONDS}
				label="Speak · up to 5 minutes"
				disabled={busy}
				onState={(state) => {
					if (state.recording && !recording) preview = null;
					// A recording just kept offline: count it as waiting.
					if (transcribing && !state.busy) void resume();
					recording = state.recording;
					transcribing = state.busy;
					voiceMessage = state.message;
				}}
				onText={(clip) => {
					text = [text, clip].filter(Boolean).join(' ').slice(0, 8000);
					onDirty?.();
				}}
			/>{/if}<button
			class="btn"
			type="button"
			disabled={busy || recording || transcribing || !text.trim()}
			onclick={draft}>{busy ? 'Working…' : 'Prepare a draft'}</button
		>
	</div>
	{#if recording}<p role="status">
			Recording <span class="elapsed">{clock(elapsed)}</span> of 5:00. Stops automatically at 5 minutes.
		</p>{/if}
	{#if !voice}<p class="muted">
			Voice will be available once your agency connects transcription. You can type here now.
		</p>{/if}
	{#if message || voiceMessage}<p role="status">{message || voiceMessage}</p>{/if}
	{#if waiting && !online}<p class="muted s14">
			{waiting}
			{waiting === 1 ? 'recording is' : 'recordings are'} saved on this device and will be transcribed
			when you’re back online.
		</p>{/if}
	{#if preview}{#key preview}<LomiReview
				result={preview}
				{voice}
				{clientId}
				{type}
				{onDirty}
				onUse={(result) => {
					onDraft(result);
					preview = null;
					text = '';
				}}
			/>{/key}{/if}
</section>

<style>
	.lomi-panel {
		border-color: var(--lemon-line);
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
