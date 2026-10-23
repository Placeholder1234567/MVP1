<script lang="ts">
	// Analytics (frontend-spec-3.md §4.4): coverage, documentation and care,
	// week by week. Supervisors and admins on the Complete plan.
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { ReportJobGuard, reportCanConnect } from '#lib/app/report-job.ts';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import Skeleton from '#lib/app/Skeleton.svelte';
	import TrendArrow from '#lib/app/components/TrendArrow.svelte';
	import { fullWeekTrend } from '#lib/domain/index.ts';

	type Weekly = Awaited<ReturnType<typeof trpc.analytics.weekly.query>>;
	const app = useSession();
	let data = $state<Weekly | null>(null);
	let homeId = $state('');
	let message = $state('');

	let loading = $state(false);
	let online = $state(false);
	let visible = $state(false);
	let loadedHomeName = $state('');
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
			!homeId || app.homes.some((h) => h.id === homeId)
		]);
	const canConnect = $derived(
		reportCanConnect(online, visible, app.privacyLocked) &&
			app.user.role !== 'caregiver' &&
			app.user.features.includes('analytics') &&
			(!homeId || app.homes.some((h) => h.id === homeId))
	);
	function abort() {
		controller?.abort();
		loading = false;
	}
	function forget() {
		abort();
		data = null;
		loadedHomeName = '';
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
		guard.change('disposed');
		abort();
	});
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
			visible = document.visibilityState === 'visible';
			if (!online || !visible) {
				guard.change(`unavailable-${Date.now()}`);
				abort();
			}
		};
		update();
		void load();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		document.addEventListener('visibilitychange', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
			document.removeEventListener('visibilitychange', update);
		};
	});
	async function load() {
		// Clear the prior home synchronously, before its new label can render.
		forget();
		if (!canConnect) return;
		guard.change(context());
		const original = context();
		const stillCurrent = guard.capture();
		const requestedHome = homeId;
		const requestedName = app.homes.find((h) => h.id === requestedHome)?.name ?? 'All homes';
		const pending = new AbortController();
		controller = pending;
		const valid = () =>
			stillCurrent() &&
			original === context() &&
			canConnect &&
			!pending.signal.aborted &&
			controller === pending;
		loading = true;
		try {
			const result = await trpc.analytics.weekly.query(
				{ homeId: requestedHome || undefined, weeks: 4 },
				{ signal: pending.signal }
			);
			if (valid()) {
				data = result;
				loadedHomeName = requestedName;
			}
		} catch (e) {
			if (valid()) message = e instanceof Error ? e.message : 'Connect to load analytics.';
		} finally {
			if (valid()) loading = false;
		}
	}

	const short = (week: string) =>
		new Date(`${week}T12:00:00Z`).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	const last = (values: (number | null)[]) => values.at(-1) ?? null;
	const homeName = $derived(app.homes.find((h) => h.id === homeId)?.name ?? 'All homes');
</script>

<!-- better: whether a rise is good news for this measure (it colours the trend arrow) -->
{#snippet kpi(
	label: string,
	values: (number | null)[],
	unit = '',
	better: 'higher' | 'lower' = 'higher'
)}
	{@const current = last(values)}
	{@const max = Math.max(1, ...values.map((v) => v ?? 0))}
	<article class="card kpi" aria-label={label}>
		<div class="top">
			<span class="muted">{label}</span><TrendArrow
				values={fullWeekTrend(values)}
				{label}
				against="last full week against the two before"
				higherIsBetter={better === 'higher'}
			/>
		</div>
		<span class="num">{current === null ? '—' : `${current}${unit}`}</span>
		<div
			class="chart"
			role="img"
			aria-label="{label} by week: {values.map((v) => v ?? 'none').join(', ')}"
		>
			{#each values as v, i (i)}
				<div class="c">
					<span class="v">{v === null ? '—' : `${v}${unit}`}</span>
					<span class="b" style:height="{Math.max(4, ((v ?? 0) / max) * 80)}px"></span>
					<span class="l">{data ? short(data.weeks[i]) : ''}</span>
				</div>
			{/each}
		</div>
	</article>
{/snippet}

<svelte:head><title>Analytics · Guad</title></svelte:head>

<section class="stack" aria-label="Analytics">
	<div class="spread">
		<div>
			<h1>Analytics</h1>
			<p class="muted">
				{data ? loadedHomeName : homeName} · last 4 weeks, by week starting. Arrows compare the last full
				week with the two before it.
			</p>
		</div>
		<div>
			<label for="analytics-home">Home</label>
			<select id="analytics-home" class="input" bind:value={homeId} onchange={load}>
				<option value="">All homes</option>
				{#each app.homes as h (h.id)}<option value={h.id}>{h.name}</option>{/each}
			</select>
		</div>
	</div>
	<div class="actions">
		<button class="btn sec" disabled={!canConnect || loading} onclick={load}
			>Refresh analytics</button
		>
	</div>
	<p class="muted">
		Refresh while online and unlocked to load the selected home. Already loaded analytics remain
		readable offline; locking clears them.
	</p>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if loading}<Skeleton kind="stats" count={3} label="Loading analytics" />{/if}
	{#if data}
		<div class="spread">
			<h2>Coverage</h2>
			<span class="muted">Powered by Lomi</span>
		</div>
		<div class="kpis">
			{@render kpi('Shifts needing cover', data.coverage.needingCover, '', 'lower')}
			{@render kpi('Filled', data.coverage.fillRate, '%')}
			{@render kpi('Average time to fill', data.coverage.avgFillMinutes, ' min', 'lower')}
		</div>

		<h2>Documentation</h2>
		<div class="kpis">
			{@render kpi('Shifts with a signed note', data.documentation.completeness, '%')}
			{@render kpi('Notes signed', data.documentation.signed)}
			{@render kpi('Drafted with Lomi', data.documentation.lomiRate, '%')}
			{@render kpi('Lomi drafts sent back', data.documentation.lomiSentBackRate, '%', 'lower')}
			{@render kpi('Hours to approve', data.documentation.hoursToApprove, ' h', 'lower')}
			{@render kpi('Notes sent back', data.documentation.sentBack, '', 'lower')}
		</div>

		<h2>Care</h2>
		<div class="kpis">
			{@render kpi('Scheduled doses given', data.care.medCompliance, '%')}
			{@render kpi('Doses given', data.care.dosesGiven)}
			{@render kpi('Refused or held', data.care.refusedOrHeld, '', 'lower')}
			{@render kpi('Incidents', data.care.incidents, '', 'lower')}
			<article class="card kpi" aria-label="Goal progress">
				<div class="top"><b>Goal progress</b><span class="muted">Independent rate</span></div>
				{#each data.goalProgress as g (g.goalId)}
					<div class="stack goal">
						<div class="spread">
							<span>{g.person}: {g.text}</span><b>{g.independentRate ?? 0}%</b>
						</div>
						<div class="bar"><i style:width="{g.independentRate ?? 0}%"></i></div>
					</div>
				{:else}
					<p class="muted">No goal trials recorded in these weeks.</p>
				{/each}
			</article>
		</div>
	{/if}
</section>

<style>
	#analytics-home {
		margin-top: 6px;
	}
	/* Ported from mvp/styles.css (.kpis, .kpi, .chart, .bar). */
	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 14px;
	}
	.kpi {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.kpi .top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.kpi .num {
		font-size: 30px;
		font-weight: 600;
		line-height: 1;
	}
	.chart {
		display: flex;
		align-items: flex-end;
		gap: 10px;
		height: 120px;
		padding-top: 6px;
	}
	.chart .c {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		height: 100%;
		justify-content: flex-end;
	}
	.chart .b {
		width: 100%;
		max-width: 46px;
		border-radius: 8px 8px 3px 3px;
		background: var(--sky);
	}
	.chart .c:last-child .b {
		background: var(--blue);
	}
	.chart .v {
		font-size: 12.5px;
		font-weight: 600;
	}
	.chart .l {
		font-size: 12px;
		color: var(--muted);
	}
	.goal {
		gap: 4px;
		font-size: 13px;
	}
	.bar {
		height: 6px;
		background: var(--sky);
		border-radius: 999px;
		overflow: hidden;
	}
	.bar > i {
		display: block;
		height: 100%;
		background: var(--blue);
		border-radius: 999px;
		transition: width 0.4s ease;
	}
</style>
