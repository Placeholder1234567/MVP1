<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import LomiReview from './LomiReview.svelte';
	import LomiVoice from './LomiVoice.svelte';
	import { RECORDING_MAX_SECONDS } from './voice-capture';
	import { trpc } from '#lib/trpc.ts';
	import { appendObservations } from '#lib/domain/observation-text.ts';
	import {
		draftLocally,
		topicSuggestions,
		type DraftResult,
		type NoteKind
	} from '#lib/domain/lomi.ts';
	import { useSession } from './session.svelte';
	import { LomiRecoveryStore } from './lomi-recovery';
	import {
		lomiRecoveryData,
		retainParentEdits,
		sameLomiBinding,
		type LomiBinding,
		type LomiLedger,
		type LomiRecovery
	} from './lomi-recovery-data';
	const app = useSession();
	let {
		clientId,
		type,
		shift,
		binding,
		noteId = null,
		createdNoteId = '',
		currentContent,
		onDraft,
		onDirty
	}: {
		clientId: string;
		type: NoteKind;
		/** The shift the note covers, for the topic reminders */
		shift?: 'am' | 'pm' | 'on' | null;
		binding: LomiBinding;
		noteId?: string | null;
		createdNoteId?: string;
		currentContent: Record<string, string>;
		onDraft: (result: DraftResult) => void;
		onDirty?: () => void;
	} = $props();
	let text = $state('');
	// The words the shown draft was made from.
	let said = $state('');
	let busy = $state(false);
	let recording = $state(false);
	let transcribing = $state(false);
	let voice = $state(false);
	let aiDraftConnected = $state<boolean | null>(null);
	let message = $state('');
	let preview = $state<DraftResult | null>(null);
	let voiceMessage = $state('');
	const originalBinding = untrack(() => ({ ...binding }));
	let recovery = $state<LomiRecovery | null>(null);
	let activeRecovery = false;
	let boundNoteId = untrack(() => noteId);
	let invalidated = false;
	$effect(() => {
		if (noteId === boundNoteId) return;
		if (boundNoteId === null && noteId === createdNoteId) boundNoteId = noteId;
		else {
			invalidated = true;
			preview = null;
			recovery = null;
		}
	});
	let reviewSeed = $state<LomiLedger | undefined>();
	let retryOnResume = $state(false);
	let storageReady = $state(false);
	let storageError = $state(false);
	let storagePending = $state(false);
	let loadingRecovery = false;
	let store: LomiRecoveryStore | undefined;
	let alive = false;
	function validContext() {
		return (
			!invalidated &&
			noteId === boundNoteId &&
			alive &&
			!app.privacyLocked &&
			sameLomiBinding(binding, originalBinding) &&
			app.user.agencyId === originalBinding.agencyId &&
			app.user.profileId === originalBinding.profileId &&
			app.homeId === originalBinding.homeId &&
			app.people.some(
				(person) => person.id === clientId && person.home_id === originalBinding.homeId
			)
		);
	}
	async function loadRecovery() {
		if (loadingRecovery) return;
		loadingRecovery = true;
		storageReady = false;
		try {
			const saved = await store?.load();
			if (!validContext()) return;
			if (saved && saved.noteId === noteId)
				recovery = saved.phase === 'used' ? retainParentEdits(saved, currentContent) : saved;
			storageError = false;
			storageReady = true;
		} catch {
			storageError = true;
		} finally {
			loadingRecovery = false;
		}
	}
	$effect(() => {
		if (!app.privacyLocked)
			untrack(() => {
				if (alive && !invalidated && !storageReady && !storageError && store) void loadRecovery();
			});
	});
	onMount(() => {
		alive = true;
		store = new LomiRecoveryStore(
			() => app.db,
			originalBinding,
			(error) => {
				storageError = error;
				storagePending = error;
			}
		);
		void loadRecovery();
		return () => {
			alive = false;
			store?.dispose();
		};
	});
	function persist(record: LomiRecovery) {
		if (!storageReady || !validContext()) return;
		const parsed = lomiRecoveryData(record);
		if (!parsed) {
			storageError = true;
			return;
		}
		recovery = parsed;
		storagePending = true;
		store?.queue(parsed);
	}
	function rememberReview(ledger: LomiLedger) {
		if (!preview) return;
		activeRecovery = true;
		persist({
			day: binding.day,
			binding: { ...binding },
			noteId,
			said,
			original: preview,
			ledger,
			phase: 'review'
		});
	}
	$effect(() => {
		const content = { ...currentContent },
			id = noteId,
			phase = recovery?.phase;
		if (phase !== 'used') return;
		untrack(() => {
			if (!activeRecovery || !recovery || !validContext()) return;
			const next = { ...retainParentEdits(recovery, content), noteId: id };
			if (JSON.stringify(next) !== JSON.stringify(recovery)) persist(next);
		});
	});
	function resumeReview() {
		if (!recovery || recovery.noteId !== noteId || !validContext() || busy || !storageReady) return;
		activeRecovery = true;
		if (
			text.trim() &&
			!confirm(
				'Replace the observations currently in this assistant with your saved Lomi review? The note below will stay unchanged.'
			)
		)
			return;
		const saved =
			recovery.phase === 'used' ? retainParentEdits(recovery, currentContent) : recovery;
		said = saved.said;
		text = saved.said;
		reviewSeed = saved.ledger;
		retryOnResume = true;
		preview = saved.original;
		onDirty?.();
	}
	async function discardRecovery() {
		if (
			busy ||
			!validContext() ||
			!confirm(
				'Discard the saved Lomi observations and review on this device? Your saved note stays unchanged.'
			)
		)
			return;
		const target = store;
		if (!target) return;
		busy = true;
		storageReady = false;
		activeRecovery = false;
		try {
			await target.clear();
			if (!validContext() || store !== target) return;
			// Keep the recovery controls present until encrypted deletion completes.
			// Their disappearance is the UI acknowledgement that reload is safe.
			if (!storageError) {
				preview = null;
				recovery = null;
				reviewSeed = undefined;
			}
			storageReady = !storageError;
		} finally {
			busy = false;
		}
	}
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
				if (!validContext()) return;
				aiDraftConnected = c.draft;
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
	let recordingNeedsRoom = $state(false);
	type Kept = { id: string; recording_id: string; mime: string; audio: string };
	async function resume(explicit = false) {
		const db = app.db;
		if (!db || resuming || !validContext() || (recordingNeedsRoom && !explicit)) return;
		resuming = true;
		try {
			const rows = await db.getAll<Kept>(
				'SELECT id, recording_id, mime, audio FROM pending_recordings WHERE profile_id = ? AND client_id = ? AND kind = ? ORDER BY recorded_at, recording_id, part',
				[originalBinding.profileId, clientId, type]
			);
			if (!validContext()) return;
			waiting = new Set(rows.map((r) => r.recording_id)).size;
			recordingNeedsRoom = false;
			if (!online || !rows.length) return;
			for (const recording of [...new Set(rows.map((r) => r.recording_id))]) {
				const parts = rows.filter((r) => r.recording_id === recording);
				const texts: string[] = [];
				for (const part of parts) {
					if (!validContext()) return;
					texts.push(
						(
							await trpc.lomi.transcribe.mutate({
								audio: part.audio,
								mimeType: part.mime as 'audio/webm' | 'audio/mp4' | 'audio/ogg'
							})
						).text.trim()
					);
				}
				const clip = texts.filter(Boolean).join(' ');
				if (!validContext()) return;
				if (clip) {
					const combined = appendObservations(text, clip, 8000);
					if (combined === null) {
						recordingNeedsRoom = true;
						message =
							'The saved recording does not fit in your observations. Nothing was added or cut off. The recording is still saved on this encrypted device. Make room, then retry saved recordings.';
						return;
					}
					text = combined;
					preview = null;
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
		void app.privacyLocked;
		untrack(() => void resume());
	});
	async function draft() {
		if (!text.trim() || busy || !storageReady || !validContext()) return;
		if (
			recovery &&
			!confirm(
				'Replace your saved Lomi review with a new draft from these observations? Your note below will stay unchanged.'
			)
		)
			return;
		busy = true;
		reviewSeed = undefined;
		retryOnResume = false;
		said = text;
		const source = text;
		message = '';
		try {
			const next = await trpc.lomi.draft.mutate({ clientId, type, prompt: source });
			if (validContext() && text === source) {
				preview = next;
				onDirty?.();
			}
		} catch {
			if (validContext() && text === source) preview = draftLocally(source, type);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />
<section id="lomi" class="card pad stack lomi-panel" aria-label="Lomi drafting assistant">
	<div class="spread">
		<div>
			<p class="eyebrow">A little help from Lomi</p>
			<h2>Tell the story of your shift.</h2>
		</div>
		<span class="lemon-orb" aria-hidden="true">◒</span>
	</div>
	<p class="muted">Use your own words. Lomi helps organize them, and you review every section.</p>
	{#if aiDraftConnected === false}<p class="callout" role="status" data-testid="lomi-local-mode">
			AI drafting isn’t connected. You can still type observations: Lomi will sort your sentences
			into sections without rewriting them. Review each section before using it.
		</p>{/if}
	{#if recovery && recovery.noteId === noteId && !preview}<div class="callout stack">
			<p>
				A Lomi review is saved in this device’s encrypted database for this person and note period.
				Resume explicitly to review it and retry an unfinished local draft online. The note below
				will not change until you choose Use.
			</p>
			<div class="actions">
				<button
					class="btn sec"
					type="button"
					disabled={busy || !storageReady}
					onclick={resumeReview}>Resume saved Lomi review</button
				><button
					class="btn sec"
					type="button"
					disabled={busy}
					onclick={() => void discardRecovery()}>Discard saved Lomi review</button
				>
			</div>
		</div>{/if}
	{#if storageError}<p role="alert" class="callout bad">
			The Lomi review could not be saved or checked on this device. Keep this screen open to
			preserve your work.
		</p>
		<button
			class="btn sec"
			type="button"
			onclick={() => {
				if (storageReady) void store?.flush();
				else void loadRecovery();
			}}>Retry Lomi review storage</button
		>
		{#if !storageReady}<button
				class="btn sec"
				type="button"
				disabled={busy}
				onclick={() => void discardRecovery()}>Discard unavailable Lomi recovery</button
			>{/if}
	{:else if recovery}<p class="muted" role="status" data-testid="lomi-recovery-status">
			{storagePending
				? 'Saving Lomi review on this encrypted device…'
				: 'Saved Lomi review on this encrypted device.'} This does not save or sign the note.
		</p>{/if}
	<div class="try" role="group" aria-label="Try covering">
		<span class="muted">Try covering:</span>
		{#each topicSuggestions(type, shift) as topic (topic)}<span class="tag">{topic}</span>{/each}
	</div>
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
					const combined = appendObservations(text, clip, 8000);
					if (combined === null) {
						onDirty?.();
						return false;
					}
					text = combined;
					preview = null;
					onDirty?.();
					return true;
				}}
			/>{/if}<button
			class="btn"
			type="button"
			disabled={busy || recording || transcribing || !text.trim() || !storageReady}
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
	{#if recordingNeedsRoom && online}<button
			class="btn sec"
			type="button"
			disabled={busy || recording || transcribing}
			onclick={() => void resume(true)}>Retry saved recordings</button
		>{/if}
	{#if waiting && !online}<p class="muted s14">
			{waiting}
			{waiting === 1 ? 'recording is' : 'recordings are'} saved on this device and will be transcribed
			when you’re back online.
		</p>{/if}
	{#if preview}{#key preview}<LomiReview
				result={preview}
				{said}
				{voice}
				{clientId}
				{type}
				{onDirty}
				savedLedger={reviewSeed}
				{retryOnResume}
				onSnapshot={rememberReview}
				onUse={(result, ledger) => {
					onDraft(result);
					if (preview)
						persist({
							day: binding.day,
							binding: { ...binding },
							noteId,
							said,
							original: preview,
							ledger: { ...ledger, content: { ...result.content }, currentResult: result },
							phase: 'used'
						});
					preview = null;
					text = '';
				}}
			/>{/key}{/if}
</section>

<style>
	/* Ported from mvp/styles.css (.cv-try, .cv-tag). */
	.try {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		font-size: 14px;
	}
	.tag {
		background: var(--sky);
		color: var(--blue);
		font-weight: 600;
		border-radius: 999px;
		padding: 6px 12px;
	}
	.lomi-panel {
		border-color: var(--lemon-line);
	}
	.lemon-orb {
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		background: var(--lemon);
		color: #1c1b4b;
		border-radius: 50%;
		font-size: 38px;
	}
</style>
