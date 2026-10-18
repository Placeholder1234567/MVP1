<script lang="ts">
	import { onMount } from 'svelte';
	import LomiReview from './LomiReview.svelte';
	import LomiVoice from './LomiVoice.svelte';
	import { RECORDING_MAX_SECONDS } from './voice-capture';
	import { trpc } from '#lib/trpc.ts';
	import { draftLocally, type DraftResult, type NoteKind } from '#lib/domain/lomi.ts';
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
	onMount(() => {
		void trpc.lomi.capabilities
			.query()
			.then((c) => (voice = c.voice))
			.catch(() => {});
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
				seconds={RECORDING_MAX_SECONDS}
				label="Speak · up to 5 minutes"
				disabled={busy}
				onState={(state) => {
					if (state.recording && !recording) preview = null;
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
		color: #1c1b4b;
		border-radius: 50%;
		font-size: 38px;
	}
</style>
