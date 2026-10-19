<script lang="ts">
	import { resolve } from '$app/paths';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import {
		addDays,
		compliance,
		dailyCompliance,
		dosesDue,
		localInstant,
		localTime,
		marGrid
	} from '#lib/domain/index.ts';
	import Sparkline from '#lib/app/components/Sparkline.svelte';
	import ProgressRing from '#lib/app/components/ProgressRing.svelte';
	import {
		complianceScore,
		incidentReviewPart,
		scoreChange,
		shiftNotesPart
	} from '#lib/domain/compliance.ts';
	import ClinicalAttention from '#lib/app/ClinicalAttention.svelte';
	import LomiSummary from '#lib/app/LomiSummary.svelte';
	import HealthWatch from '#lib/app/HealthWatch.svelte';
	import { page } from '$app/state';
	const app = useSession();
	const lomiSummary = $derived(
		((page.data.user?.features ?? []) as readonly string[]).includes('lomi_summary')
	);
	const now = localTime(new Date(), app.user.timeZone);
	const today = now.day;
	const clock = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
	const notes = $derived(app.notes.filter((n) => n.home_id === app.homeId));
	const pending = $derived(notes.filter((n) => n.status === 'submitted'));
	/** Signed notes for today's shifts (the note's shift day), the same set the link opens. */
	const signed = $derived(
		notes.filter(
			(n) => n.day === today && ['submitted', 'approved', 'returned'].includes(n.status ?? '')
		)
	);
	const openIncidents = $derived(
		app.incidents.filter((r) => r.home_id === app.homeId && r.status === 'open').length
	);
	/** Scheduled doses whose time has come today with no record yet. */
	const notRecorded = $derived(
		app.currentPeople.reduce((sum, person) => {
			const meds = app.medications
				.filter((m) => m.client_id === person.id)
				.map((m) => ({ ...m, scheduled_times: parseJson<string[]>(m.scheduled_times, []) }));
			const records = app.doses
				.filter((r) => r.client_id === person.id && r.day === today)
				.map((r) => ({
					medication_id: r.medication_id ?? '',
					day: r.day ?? '',
					scheduled_time: r.scheduled_time,
					is_prn: !!r.is_prn,
					amends_id: r.amends_id,
					conflict_with: r.conflict_with
				}));
			return sum + dosesDue(meds, records, today).filter((d) => d.time <= clock).length;
		}, 0)
	);
	/** Share of due scheduled doses given each day for the last 7 days (MAR on the device). */
	const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
	/** The seven days before that, for the compliance score's change. */
	const lastWeek = Array.from({ length: 7 }, (_, i) => addDays(today, i - 13));
	const weekGrids = $derived(gridsFor(week));
	const lastWeekGrids = $derived(gridsFor(lastWeek));
	function gridsFor(days: string[]) {
		return app.currentPeople.map((person) =>
			marGrid(
				app.medications
					.filter((m) => m.client_id === person.id)
					.map((m) => ({
						id: m.id,
						name: m.name,
						dose: m.dose,
						scheduled_times: parseJson<string[]>(m.scheduled_times, []),
						started_at: m.started_at,
						stopped_at: m.stopped_at
					})),
				app.doses
					.filter((r) => r.client_id === person.id && r.day && days.includes(r.day))
					.map((r) => ({
						id: r.id,
						medication_id: r.medication_id,
						day: r.day,
						scheduled_time: r.scheduled_time,
						status: r.status,
						is_prn: !!r.is_prn,
						amends_id: r.amends_id,
						conflict_with: r.conflict_with,
						recorded_at: r.recorded_at
					})),
				days,
				{ day: today, time: clock },
				(iso) => localTime(new Date(iso), app.user.timeZone).day
			)
		);
	}
	const weekDaily = $derived(dailyCompliance(weekGrids, 7));
	const weekScore = $derived(compliance(weekGrids.flat()));
	/** Documentation compliance over seven days (frontend-spec-3.md §4.1). */
	function scoreFor(days: string[], meds: { given: number; due: number }, until?: Date) {
		return complianceScore(
			shiftNotesPart(app.shifts, app.notes, app.homeId, days, new Date(), app.user.timeZone),
			app.has('mar') ? { done: meds.given, of: meds.due } : { done: 0, of: 0 },
			incidentReviewPart(
				app.incidents.filter((i) => i.home_id === app.homeId),
				localInstant(days[0], '00:00', app.user.timeZone),
				new Date(),
				until
			)
		);
	}
	const score = $derived(scoreFor(week, weekScore));
	// Against the seven days before (the "delta arrow"), in percentage points.
	const change = $derived(
		scoreChange(
			scoreFor(
				lastWeek,
				compliance(lastWeekGrids.flat()),
				localInstant(week[0], '00:00', app.user.timeZone)
			).score,
			score.score
		)
	);
	const share = (p: { done: number; of: number }) =>
		p.of ? `${p.done} of ${p.of}` : 'nothing to measure yet';
	const dayName = (day: string) =>
		new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
			weekday: 'short',
			timeZone: 'UTC'
		});
</script>

<svelte:head><title>Overview · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Your home at a glance</p>
	<h1>A clearer picture of care.</h1>
	<div class="actions">
		<a class="btn sec" href={resolve('/(app)/today')}>Care records</a><a
			class="btn sec"
			href={resolve('/(app)/shifts')}>Schedule</a
		><a class="btn sec" href={resolve('/(app)/dashboard/timesheets')}>Timesheets</a>
		<a class="btn sec" href={resolve('/(app)/dashboard/intake')}>Intake</a>
	</div>
	<p class="muted">
		Documentation and attention for {app.homes.find((h) => h.id === app.homeId)?.name ??
			'your home'}.
	</p>
	{#if lomiSummary && app.homeId}<LomiSummary homeId={app.homeId} />{/if}
	<div class="stats four">
		<a class="card pad stat" href={resolve('/(app)/dashboard/notes')}>
			<p class="muted">Notes to review</p>
			<p class="stat-number">{pending.length}</p>
		</a>
		<a
			class="card pad stat"
			href="{resolve('/(app)/dashboard/notes')}?show=all&from={today}&to={today}"
		>
			<p class="muted">Signed today</p>
			<p class="stat-number">{signed.length}</p>
		</a>
		<a class="card pad stat" href="#attention-h">
			<p class="muted">Open incidents</p>
			<p class="stat-number">{openIncidents}</p>
		</a>
		<div class="card pad">
			<p class="muted">Doses not recorded</p>
			<p class="stat-number">{notRecorded}</p>
			{#if app.has('mar') && weekScore.percent !== null}
				<a class="week" href={resolve('/(app)/dashboard/mar')}
					><span class="muted">Given, 7 days: <b>{weekScore.percent}%</b></span><Sparkline
						values={weekDaily}
						label="Doses given by day: {week
							.map(
								(d, i) => `${dayName(d)} ${weekDaily[i] === null ? 'none due' : `${weekDaily[i]}%`}`
							)
							.join(', ')}"
					/></a
				>
			{/if}
		</div>
	</div>
	{#if score.score !== null}<section class="card pad compliance" aria-labelledby="compliance-h">
			<ProgressRing percent={score.score} label="Compliance {score.score}%" thresholds={[90, 70]} />
			<div class="stack">
				<h2 id="compliance-h">
					Compliance, 7 days: {score.score}%{#if change}
						<span
							class="delta {change.direction === 'up'
								? 'ok'
								: change.direction === 'down'
									? 'bad'
									: 'muted'}"
							><span aria-hidden="true"
								>{change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : '▶'}
								{change.direction === 'steady'
									? 'steady'
									: `${change.points > 0 ? '+' : '−'}${Math.abs(change.points)} pts`}</span
							><span class="sr"
								>{change.direction === 'steady'
									? 'steady against the previous 7 days'
									: `${change.direction} ${Math.abs(change.points)} points against the previous 7 days`}</span
							></span
						>{/if}
				</h2>
				<p class="muted s13">
					Shifts with a signed note: {share(score.notes)} · Scheduled doses given: {share(
						score.meds
					)} · Incidents reviewed within a day: {share(score.incidents)}
				</p>
			</div>
		</section>{/if}
	<ClinicalAttention />
	{#if ((page.data.user?.features ?? []) as readonly string[]).includes('health')}<HealthWatch
		/>{/if}
</div>

<style>
	.stats.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.compliance {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.compliance h2 {
		font-size: 16px;
		margin: 0;
	}
	.stat {
		color: inherit;
		text-decoration: none;
	}
	.week {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-top: 8px;
		font-size: 13px;
		color: inherit;
		text-decoration: none;
	}
	@media (max-width: 900px) {
		.stats.four {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.delta {
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		margin-left: 6px;
	}
	.delta.ok {
		color: var(--ok);
	}
	.delta.bad {
		color: var(--bad);
	}
	.delta.muted {
		color: var(--muted);
	}
</style>
