<script lang="ts">
	// Lomi's summary card on the supervisor overview (frontend-spec-3.md §4.1;
	// mvp/src/app-office.js .lomi-card). A short briefing on one home's day;
	// highlights and recommendations come with analytics_advanced. Generated on
	// request, like the MVP, since summaries are limited to 5 an hour.
	import { trpc } from '#lib/trpc.ts';

	type Summary = Awaited<ReturnType<typeof trpc.lomi.summarize.mutate>>;
	let { homeId }: { homeId: string } = $props();
	let result = $state<Summary | null>(null);
	let at = $state<Date | null>(null);
	let busy = $state(false);
	let message = $state('');
	let tick = $state(Date.now());

	$effect(() => {
		// A new home starts with no summary.
		void homeId;
		result = null;
		at = null;
		message = '';
	});
	$effect(() => {
		const t = setInterval(() => (tick = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	async function summarize() {
		busy = true;
		message = '';
		try {
			result = await trpc.lomi.summarize.mutate({ homeId });
			at = new Date();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connect to summarize today.';
		} finally {
			busy = false;
		}
	}
	const ago = $derived.by(() => {
		if (!at) return '';
		const min = Math.floor((tick - at.getTime()) / 60_000);
		return min < 1 ? 'Refreshed just now' : `Refreshed ${min} min ago`;
	});
</script>

<section class="lomi-card" aria-label="Lomi's summary" aria-busy={busy}>
	<span class="orb" aria-hidden="true">◒</span>
	<div class="body">
		<b>Lomi's summary</b>
		{#if busy && !result}
			<p class="muted">Reading today's records…</p>
		{:else if result}
			<p class="text" aria-live="polite">{result.summary}</p>
			{#if result.highlights.length}
				<h3>Highlights</h3>
				<ul>
					{#each result.highlights as h, i (i)}<li>{h.text}</li>{/each}
				</ul>
			{/if}
			{#if result.recommendations.length}
				<h3>Recommendations</h3>
				<ul>
					{#each result.recommendations as r, i (i)}<li>{r.text}</li>{/each}
				</ul>
			{/if}
			<p class="foot muted">
				{ago}{result.fallback ? ' · Written from today’s counts' : ''}
			</p>
		{:else}
			<p class="muted">A quick read on today across coverage, notes, incidents, meds and health.</p>
		{/if}
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		<div>
			<button type="button" class="btn sec" disabled={busy} onclick={summarize}>
				{busy ? 'Summarizing…' : result ? 'Refresh summary' : 'Summarize today'}
			</button>
		</div>
	</div>
</section>

<style>
	/* Ported from mvp/styles.css .lomi-card */
	.lomi-card {
		background: var(--lemon-2);
		border: 1px solid var(--lemon-line);
		border-radius: 20px;
		padding: 18px 20px;
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}
	.orb {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		height: 40px;
		background: var(--lemon);
		color: var(--ink);
		border-radius: 50%;
		font-size: 26px;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}
	.body p {
		margin: 0;
	}
	.text {
		font-size: 15px;
		line-height: 1.5;
	}
	h3 {
		margin: 4px 0 0;
		font-size: 14px;
	}
	ul {
		margin: 0;
		padding-left: 20px;
		font-size: 14px;
		line-height: 1.5;
	}
	.foot {
		font-size: 13px;
	}
</style>
