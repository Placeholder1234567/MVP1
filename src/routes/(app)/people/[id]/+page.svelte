<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { doseSlots, dosesDue, shiftAt } from '#lib/domain/index.ts';
	const app = useSession();
	const person = $derived(app.people.find((p) => p.id === page.params.id));
	const home = $derived(app.homes.find((h) => h.id === person?.home_id));
	const first = $derived(person?.first_name || person?.name?.split(' ')[0] || 'this person');
	const goals = $derived(app.goals.filter((g) => g.client_id === person?.id && !g.stopped_at));
	const behaviors = $derived(parseJson<string[]>(person?.behaviors, []));
	const now = shiftAt(new Date(), app.user.timeZone);
	const note = $derived(
		app.notes.find(
			(n) =>
				n.client_id === person?.id &&
				n.type === 'shift' &&
				n.day === now.day &&
				n.shift === now.shift &&
				n.author_id === app.user.profileId
		)
	);
	const meds = $derived(
		app.medications
			.filter((m) => m.client_id === person?.id)
			.map((m) => ({ ...m, scheduled_times: parseJson<string[]>(m.scheduled_times, []) }))
	);
	const slots = $derived(doseSlots(meds));
	const due = $derived(
		dosesDue(
			meds,
			app.doses
				.filter((r) => r.client_id === person?.id)
				.map((r) => ({
					medication_id: r.medication_id ?? '',
					day: r.day ?? '',
					scheduled_time: r.scheduled_time,
					is_prn: !!r.is_prn,
					amends_id: r.amends_id,
					conflict_with: r.conflict_with
				})),
			now.day
		)
	);
	const attendance = $derived(
		app.attendance.find((a) => a.client_id === person?.id && a.day === now.day)
	);
</script>

{#snippet chev()}<span class="chev" aria-hidden="true">›</span>{/snippet}

<svelte:head><title>Person · Guad</title></svelte:head>
<div class="stack person">
	<a class="textbtn" href={resolve('/(app)/today')}>← Back to today</a>
	{#if person}<div class="spread">
			<div>
				<h1>{person.name}</h1>
				{#if home}<p class="muted">{home.name}</p>{/if}
			</div>
			<span class="avatar">{person.initials || person.name?.slice(0, 2)}</span>
		</div>
		{#if person.info}<p class="card pad muted s14 record-text">{person.info}</p>{/if}

		<div class="section-title"><h2>Today</h2></div>
		<div class="list card">
			<a class="row" href={resolve('/(app)/people/[id]/note', { id: person.id })}
				><span class="avatar sq" aria-hidden="true">✎</span><span class="grow"
					><b>{app.labels.shift}</b><span
						>{note?.status === 'returned'
							? 'Sent back by your supervisor'
							: goals.length
								? `Includes ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}`
								: 'Activities, meals, mood and health'}</span
					></span
				>{#if !note}<span class="pill due">To do</span>{:else if note.status === 'returned'}<span
						class="pill bad">Fix</span
					>{:else if note.status === 'draft'}<span class="pill due">Draft</span>{:else}<span
						class="pill ok">Done</span
					>{/if}</a
			>
			<a class="row" href={resolve('/(app)/people/[id]/medications', { id: person.id })}
				><span class="avatar sq" aria-hidden="true">℞</span><span class="grow"
					><b>{app.labels.medications}</b><span
						>{slots.length
							? `${slots.length} scheduled ${slots.length === 1 ? 'dose' : 'doses'}`
							: 'No scheduled doses'}</span
					></span
				>{#if slots.length}{#if due.length}<span class="pill due">{due.length} due</span
						>{:else}<span class="pill ok">Done</span>{/if}{:else}{@render chev()}{/if}</a
			>
			<a class="row" href={resolve('/(app)/people/[id]/attendance', { id: person.id })}
				><span class="avatar sq" aria-hidden="true">▦</span><span class="grow"
					><b>Attendance</b><span
						>{attendance
							? parseJson<string[]>(attendance.services, []).join(', ')
							: `Which services did ${first} get today?`}</span
					></span
				>{#if attendance}<span class="pill ok">Saved</span>{:else}<span class="pill due">To do</span
					>{/if}</a
			>
		</div>

		<div class="section-title"><h2>Record</h2></div>
		<div class="list card">
			<a class="row" href={resolve('/(app)/people/[id]/health', { id: person.id })}
				><span class="avatar sq" aria-hidden="true">♥</span><span class="grow"
					><b>Health</b><span>Vitals, seizures, illness, visits</span></span
				>{@render chev()}</a
			>
			<a class="row" href={resolve('/(app)/people/[id]/behavior', { id: person.id })}
				><span class="avatar sq" aria-hidden="true">≈</span><span class="grow"
					><b>{app.labels.behavior}</b><span
						>{behaviors.length
							? `Plan: ${behaviors.join(', ')}`
							: 'Before, what happened, response and outcome'}</span
					></span
				>{@render chev()}</a
			>
			<a class="row" href={resolve('/(app)/people/[id]/incident', { id: person.id })}
				><span class="avatar sq" aria-hidden="true">!</span><span class="grow"
					><b>Report {app.labels.incident === 'GER' ? 'a GER' : 'an incident'}</b><span
						>Falls, injuries, medication errors and more</span
					></span
				>{@render chev()}</a
			>
		</div>

		<div class="section-title"><h2>About {first}</h2></div>
		<div class="list card">
			<a class="row" href={resolve('/(app)/people/[id]/summary', { id: person.id })}
				><span class="avatar sq" aria-hidden="true">▤</span><span class="grow"
					><b>Health summary</b><span>Allergies, conditions, doctor, guardian</span></span
				>{@render chev()}</a
			>
		</div>

		<div class="section-title"><h2>{app.labels.goals}</h2></div>
		{#each goals as goal (goal.id)}<div class="card pad">
				<b>{goal.area}</b>
				<p>{goal.text}</p>
			</div>{:else}<p class="muted">No active goals have been assigned.</p>{/each}
	{:else}<div class="card empty">
			This person is not available on your device. Check your selected home or wait for sync.
		</div>{/if}
</div>

<style>
	.person {
		max-width: 720px;
	}
	.chev {
		font-size: 22px;
	}
</style>
