<script lang="ts">
	import { useSession } from './session.svelte';
	import { savedGoalTrend } from './goal-trend';
	import { localTime } from '#lib/domain/time.ts';
	import { trendChange } from '#lib/domain/trend.ts';
	import ProgressRing from './components/ProgressRing.svelte';
	import Sparkline from './components/Sparkline.svelte';
	import TrendArrow from './components/TrendArrow.svelte';
	let { clientId, homeId, goalId }: { clientId: string; homeId: string; goalId: string } = $props();
	const app = useSession();
	const trend = $derived(
		savedGoalTrend({
			agencyId: app.user.agencyId,
			clientId,
			homeId,
			goalId,
			through: localTime(new Date(), app.user.timeZone).day,
			notes: app.notes,
			trials: app.noteGoals
		})
	);
	const summary = $derived(trend.summary);
	const daily = $derived(trend.days.map((d) => d.summary?.independentPercent ?? null));
</script>

<section class="stack trend" aria-label="Saved goal progress">
	<h4>Saved goal progress</h4>
	<p class="muted">
		{trend.from} through {trend.through}. Signed and approved notes saved on this device only.
		Missing days are not failures. Reconnect for updates; use Care reports for a server export.
	</p>
	{#if summary?.independentPercent !== null && summary?.independentPercent !== undefined}
		<div class="glance">
			<ProgressRing
				percent={summary.independentPercent}
				label="{summary.independentPercent}% independent"
			/>
			<p class="grow">
				<b>{summary.independentPercent}% independent</b> · {summary.independentTrials} of {summary.recordedTrials}
				recorded trials. Refused trials stay in the denominator.
				{#if trendChange(trend.weeks)}<span class="week"
						>This week against last: <TrendArrow
							values={trend.weeks}
							label="Independent trials"
							against="this week against last"
						/></span
					>{/if}
			</p>
			{#if daily.filter((v) => v !== null).length > 1}<Sparkline
					values={daily}
					label="Independent by day: {trend.days
						.map((d, i) => `${d.day.slice(5)} ${daily[i] === null ? 'none' : `${daily[i]}%`}`)
						.join(', ')}"
				/>{/if}
		</div>
	{:else}<p>No recorded attempted trials in this saved period.</p>{/if}
	{#if summary}<p class="muted">
			Not attempted: {summary.notAttemptedRecords} records · Refused: {summary.refusedTrials} trials ·
			Empty attempted records: {summary.emptyAttemptRecords} · Unknown trial codes: {summary.unknownTrials}
			· Trials excluded from not-attempted records: {summary.ignoredTrialsOnNotAttempted}.
		</p>{/if}
	{#if trend.unreadableRecords}<p role="status">
			Some saved trial records could not be read. Counts use readable records only.
		</p>{/if}
	<details>
		<summary>Daily recorded trials</summary>
		<ol class="days">
			{#each trend.days as day (day.day)}<li>
					<b>{day.day.slice(5)}</b><span
						>{day.summary?.independentPercent === null || !day.summary
							? 'No attempted trials'
							: `${day.summary.independentTrials}/${day.summary.recordedTrials} independent (${day.summary.independentPercent}%)`}</span
					>{#if day.summary?.notAttemptedRecords}<span
							>{day.summary.notAttemptedRecords} not-attempted records</span
						>{/if}
				</li>{/each}
		</ol>
	</details>
</section>

<style>
	.trend {
		border-top: 1px solid var(--line);
		padding-top: 12px;
	}
	h4 {
		margin: 0;
		font-size: 16px;
	}
	.glance {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.glance p {
		margin: 0;
		min-width: 200px;
	}
	.week {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
		font-size: 13px;
	}
	summary {
		min-height: 44px;
		cursor: pointer;
		padding-block: 10px;
	}
	.days {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		list-style: none;
		padding: 0;
		gap: 8px;
	}
	.days li {
		display: grid;
		gap: 4px;
		padding: 10px;
		background: var(--sky);
		border-radius: 10px;
		overflow-wrap: anywhere;
	}
</style>
