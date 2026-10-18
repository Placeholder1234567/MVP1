<script lang="ts">
	import { useSession } from './session.svelte';
	import { savedGoalTrend } from './goal-trend';
	import { localTime } from '#lib/domain/time.ts';
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
</script>

<section class="stack trend" aria-label="Saved goal progress">
	<h4>Saved goal progress</h4>
	<p class="muted">
		{trend.from} through {trend.through}. Signed and approved notes saved on this device only.
		Missing days are not failures. Reconnect for updates; use Care reports for a server export.
	</p>
	{#if summary?.independentPercent !== null && summary?.independentPercent !== undefined}
		<p>
			<b>{summary.independentPercent}% independent</b> · {summary.independentTrials} of {summary.recordedTrials}
			recorded trials. Refused trials stay in the denominator.
		</p>
		<div
			class="progress"
			role="progressbar"
			aria-label="Independent recorded trials"
			aria-valuenow={summary.independentPercent}
			aria-valuemin="0"
			aria-valuemax="100"
		>
			<span style:width="{summary.independentPercent}%"></span>
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
	.progress {
		height: 10px;
		overflow: hidden;
		background: var(--sky);
		border-radius: 8px;
	}
	.progress span {
		display: block;
		height: 100%;
		background: var(--blue);
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
