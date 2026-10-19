<script lang="ts">
	// Every active goal at a glance (frontend-audit Finding 9 fix 3): the last
	// fourteen days of signed notes saved on this device, as on the goals page.
	import { resolve } from '$app/paths';
	import { useSession } from './session.svelte';
	import { savedGoalTrend } from './goal-trend';
	import { localTime } from '#lib/domain/time.ts';
	import ProgressRing from './components/ProgressRing.svelte';
	import TrendArrow from './components/TrendArrow.svelte';
	let { clientId, homeId }: { clientId: string; homeId: string } = $props();
	const app = useSession();
	const through = localTime(new Date(), app.user.timeZone).day;
	const goals = $derived(
		app.goals
			.filter((g) => g.client_id === clientId && g.home_id === homeId && !g.stopped_at)
			.map((g) => ({
				id: g.id,
				area: g.area ?? '',
				text: g.text ?? 'Goal',
				trend: savedGoalTrend({
					agencyId: app.user.agencyId,
					clientId,
					homeId,
					goalId: g.id,
					through,
					notes: app.notes,
					trials: app.noteGoals
				})
			}))
			.sort((a, b) => a.area.localeCompare(b.area) || a.text.localeCompare(b.text))
	);
</script>

<section class="stack" aria-labelledby="goal-glance">
	<div class="spread">
		<h2 id="goal-glance">Goals at a glance</h2>
		<a href={resolve('/(app)/dashboard/goals')}>Manage goals</a>
	</div>
	<p class="muted">
		Last 14 days of signed notes saved on this device. Missing days aren't failures.
	</p>
	<div class="list card" role="list">
		{#each goals as g (g.id)}
			{@const pct = g.trend.summary?.independentPercent ?? null}
			<div class="row" role="listitem">
				{#if pct !== null}<ProgressRing percent={pct} label="{pct}% independent" />{:else}<span
						class="none"
						aria-hidden="true">—</span
					>{/if}
				<span class="grow"
					><b>{g.text}</b><span
						>{g.area ? `${g.area} · ` : ''}{pct === null
							? 'No attempted trials in 14 days'
							: `${g.trend.summary?.independentTrials} of ${g.trend.summary?.recordedTrials} trials independent`}</span
					></span
				>
				<TrendArrow values={g.trend.weeks} label={g.text} against="this week against last" />
			</div>
		{:else}
			<div class="row muted" role="listitem">No active goals.</div>
		{/each}
	</div>
</section>

<style>
	.row {
		gap: 12px;
		align-items: center;
	}
	.none {
		width: 48px;
		text-align: center;
		color: var(--muted);
		flex: none;
	}
</style>
