<script lang="ts">
	// Lomi's summary card on the supervisor overview (frontend-spec-3.md §4.1;
	// mvp/src/app-office.js .lomi-card). A short briefing on one home's day;
	// highlights and suggested next steps come with analytics_advanced.
	// Generated on request, like the MVP, since summaries are limited to 5 an
	// hour. Next steps are fixed operational rules, never model text.
	import { resolve } from '$app/paths';
	import { trpc } from '#lib/trpc.ts';
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { navigating } from '$app/state';
	import { useSession } from './session.svelte';
	import { ReportJobGuard, reportCanConnect } from './report-job';

	type Summary = Awaited<ReturnType<typeof trpc.lomi.summarize.mutate>>;
	let { homeId }: { homeId: string } = $props();
	const app = useSession();
	let result = $state<Summary | null>(null);
	let at = $state<Date | null>(null);
	let busy = $state(false);
	let message = $state('');
	let tick = $state(Date.now());

	let online = $state(false),
		visible = $state(false);
	let alive = false,
		interruption = 0;
	const guard = new ReportJobGuard();
	let controller: AbortController | undefined;
	const context = () =>
		JSON.stringify([
			app.user.agencyId,
			app.user.profileId,
			app.user.role,
			app.user.homeIds,
			app.user.features,
			app.user.timeZone,
			app.homeId,
			homeId,
			app.privacyLocked,
			app.homes.some((home) => home.id === homeId)
		]);
	const canConnect = $derived(
		reportCanConnect(online, visible, app.privacyLocked) &&
			!navigating.to &&
			app.user.role !== 'caregiver' &&
			app.user.features.includes('lomi_summary') &&
			homeId === app.homeId &&
			app.homes.some((home) => home.id === homeId)
	);
	function interrupt() {
		controller?.abort();
		busy = false;
	}
	function forget() {
		interrupt();
		result = null;
		at = null;
		message = '';
	}
	$effect(() => {
		if (guard.change(context())) forget();
	});
	beforeNavigate(() => {
		guard.change('navigating');
		forget();
	});
	onDestroy(() => {
		alive = false;
		guard.change('disposed');
		interrupt();
	});
	onMount(() => {
		alive = true;
		const update = () => {
			online = navigator.onLine;
			visible = !document.hidden;
			if (!online || !visible) {
				guard.change(`unavailable-${++interruption}`);
				interrupt();
			}
		};
		update();
		const timer = setInterval(() => (tick = Date.now()), 30_000);
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		document.addEventListener('visibilitychange', update);
		return () => {
			clearInterval(timer);
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
			document.removeEventListener('visibilitychange', update);
		};
	});
	async function summarize() {
		if (busy || !canConnect || !alive) return;
		guard.change(context());
		const identity = context(),
			stillCurrent = guard.capture(),
			requestedHome = homeId;
		const pending = new AbortController();
		controller = pending;
		const valid = () =>
			alive &&
			stillCurrent() &&
			identity === context() &&
			canConnect &&
			controller === pending &&
			!pending.signal.aborted;
		busy = true;
		message = '';
		try {
			const next = await trpc.lomi.summarize.mutate(
				{ homeId: requestedHome },
				{ signal: pending.signal }
			);
			if (!valid()) return;
			result = next;
			at = new Date();
		} catch (e) {
			if (valid()) message = e instanceof Error ? e.message : 'Connect to summarize today.';
		} finally {
			if (valid()) busy = false;
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
		{:else if result && !app.privacyLocked}
			<p class="text" aria-live="polite" data-testid="lomi-summary-text">{result.summary}</p>
			{#if result.highlights.length}
				<h3>Highlights</h3>
				<ul>
					{#each result.highlights as h, i (i)}<li>{h.text}</li>{/each}
				</ul>
			{/if}
			{#if result.recommendations.length}
				<h3>Suggested next steps</h3>
				<ul>
					{#each result.recommendations as r, i (i)}<li>
							<!-- Incidents and health alerts are in the overview's attention queue. -->
							{#if r.place === 'incidents' || r.place === 'health'}<a href="#attention-h"
									>{r.text}</a
								>{:else if r.place === 'medications'}<a href={resolve('/(app)/dashboard/mar')}
									>{r.text}</a
								>{:else if r.place === 'schedule'}<a href={resolve('/(app)/shifts')}>{r.text}</a
								>{:else if r.place === 'timesheets'}<a href={resolve('/(app)/dashboard/timesheets')}
									>{r.text}</a
								>{:else}<a href={resolve('/(app)/dashboard/notes')}>{r.text}</a>{/if}
						</li>{/each}
				</ul>
			{/if}
			<p class="foot muted">
				For {result.snapshot.home} · {ago}{result.fallback ? ' · Written from today’s counts' : ''}
			</p>
		{:else}
			<p class="muted">A quick read on today across coverage, notes, incidents, meds and health.</p>
		{/if}
		{#if !online}<p class="muted">
				Connect to request a fresh summary. An already loaded summary stays available for reading.
			</p>{/if}
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		<div>
			<button type="button" class="btn sec" disabled={busy || !canConnect} onclick={summarize}>
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
		color: #1c1b4b;
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
