<script lang="ts">
	import { resolve } from '$app/paths';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { dosesDue, localTime } from '#lib/domain/index.ts';
	import ClinicalAttention from '#lib/app/ClinicalAttention.svelte';
	import LomiSummary from '#lib/app/LomiSummary.svelte';
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
	const signed = $derived(
		notes.filter(
			(n) =>
				n.created_at &&
				localTime(new Date(n.created_at), app.user.timeZone).day === today &&
				['submitted', 'approved'].includes(n.status ?? '')
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
		<div class="card pad">
			<p class="muted">Signed today</p>
			<p class="stat-number">{signed.length}</p>
		</div>
		<div class="card pad">
			<p class="muted">Open incidents</p>
			<p class="stat-number">{openIncidents}</p>
		</div>
		<div class="card pad">
			<p class="muted">Doses not recorded</p>
			<p class="stat-number">{notRecorded}</p>
		</div>
	</div>
	<ClinicalAttention />
</div>

<style>
	.stats.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.stat {
		color: inherit;
		text-decoration: none;
	}
	@media (max-width: 900px) {
		.stats.four {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
