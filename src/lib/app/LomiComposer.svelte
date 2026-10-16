<script lang="ts">
	import { onMount } from 'svelte';
	import LomiReview from './LomiReview.svelte';
	import LomiVoice from './LomiVoice.svelte';
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
				seconds={55}
				label="Speak · up to 55 seconds"
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
	{#if recording}<p role="status">Recording. Stops automatically after 55 seconds.</p>{/if}
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
