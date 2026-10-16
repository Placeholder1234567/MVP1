<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { clock12, healthSummary, medTimes } from '#lib/domain/index.ts';
	import { dayTimeOf } from '#lib/app/clinical-write.ts';
	const app = useSession();
	const person = $derived(app.people.find((p) => p.id === page.params.id));
	const info = $derived(app.healthInfo.find((h) => h.client_id === person?.id));
	const rows = $derived(
		(
			[
				['Allergies', info?.allergies],
				['Conditions', info?.conditions],
				['Diet', info?.diet],
				['Doctor', info?.doctor],
				['Guardian or contact', info?.guardian],
				[
					'Date of birth',
					info?.dob
						? new Date(`${info.dob.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
								timeZone: 'UTC',
								month: 'long',
								day: 'numeric',
								year: 'numeric'
							})
						: null
				]
			] as [string, string | null | undefined][]
		).filter(([, v]) => !!v)
	);
	const meds = $derived(
		app.medications
			.filter(
				(m) => m.client_id === person?.id && (!m.stopped_at || new Date(m.stopped_at) > new Date())
			)
			.map((m) => ({ ...m, scheduled_times: parseJson<string[]>(m.scheduled_times, []) }))
	);
	const vitals = $derived(
		app.health.find((h) => h.client_id === person?.id && h.kind === 'vitals')
	);
</script>

<svelte:head><title>Health summary · Guad</title></svelte:head>
<div class="stack summary">
	{#if person}<a class="textbtn" href={resolve('/(app)/people/[id]', { id: person.id })}>← Back</a>
		<div>
			<h1>Health summary</h1>
			<p class="muted">{person.name}</p>
		</div>
		{#if rows.length}<dl class="card pad kv">
				{#each rows as [label, value] (label)}<div>
						<dt>{label}</dt>
						<dd class="record-text">{value}</dd>
					</div>{/each}
			</dl>{:else}<p class="card empty">No health details added yet.</p>{/if}
		<div class="section-title"><h2>Current medications</h2></div>
		{#if meds.length}<div class="list card">
				{#each meds as m (m.id)}{@const times = medTimes(m)}
					<div class="row">
						<span class="grow"
							><b>{m.name}</b><span
								>{[
									m.dose,
									m.route,
									times.length ? times.map(clock12).join(', ') : m.prn_instructions
								]
									.filter(Boolean)
									.join(' · ')}</span
							></span
						>
					</div>{/each}
			</div>{:else}<p class="card empty">None listed.</p>{/if}
		{#if vitals}<div class="section-title"><h2>Latest vitals</h2></div>
			<p class="card pad s14">
				{healthSummary('vitals', parseJson<Record<string, unknown>>(vitals.data, {}))} · {dayTimeOf(
					vitals.recorded_at,
					app.user.timeZone
				)}
			</p>{/if}
	{:else}<p class="card empty">
			This person is not available on your device. Check your selected home or wait for sync.
		</p>{/if}
</div>

<style>
	.summary {
		max-width: 720px;
	}
	.kv {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.kv div {
		display: grid;
		grid-template-columns: 160px minmax(0, 1fr);
		gap: 12px;
	}
	.kv dt {
		color: var(--muted);
		font-size: 14px;
	}
	.kv dd {
		margin: 0;
	}
	@media (max-width: 600px) {
		.kv div {
			grid-template-columns: 1fr;
			gap: 2px;
		}
	}
</style>
