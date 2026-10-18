<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { countDue, shiftAt, SHIFTS } from '#lib/domain/index.ts';
	import ClockPanel from '#lib/app/ClockPanel.svelte';
	import CoverageOffers from '#lib/app/CoverageOffers.svelte';
	import InstallPrompt from '#lib/app/InstallPrompt.svelte';
	import GettingStarted from '#lib/app/GettingStarted.svelte';
	const app = useSession();
	let now = $state(new Date());
	onMount(() => {
		const timer = setInterval(() => (now = new Date()), 60000);
		return () => clearInterval(timer);
	});
	const shift = $derived(shiftAt(now, app.user.timeZone));
	const shiftName = $derived(SHIFTS.find((s) => s.key === shift.shift)!);
	const notes = $derived(
		app.notes.filter(
			(n) =>
				n.day === shift.day &&
				n.shift === shift.shift &&
				n.type === 'shift' &&
				n.author_id === app.user.profileId
		)
	);
	const completed = $derived(
		app.currentPeople.filter((p) =>
			notes.some((n) => n.client_id === p.id && ['submitted', 'approved'].includes(n.status ?? ''))
		).length
	);
	const people = $derived(
		[...app.currentPeople].sort(
			(a, b) =>
				Number(
					notes.some(
						(n) => n.client_id === a.id && ['submitted', 'approved'].includes(n.status ?? '')
					)
				) -
				Number(
					notes.some(
						(n) => n.client_id === b.id && ['submitted', 'approved'].includes(n.status ?? '')
					)
				)
		)
	);
	// Controlled medications at this home still needing a count this shift,
	// and entries waiting for this person's countersignature.
	const countsDue = $derived(
		app.medications.filter(
			(m) =>
				Number(m.controlled) &&
				!m.stopped_at &&
				m.home_id === app.homeId &&
				countDue(
					app.controlledCounts.filter((c) => c.medication_id === m.id),
					now,
					app.user.timeZone,
					app.controlledRules
				)
		).length
	);
	const toCountersign = $derived(
		app.controlledCounts.filter(
			(c) => c.witness_id === app.user.profileId && c.witness_status === 'pending'
		).length
	);
	const clock = $derived(
		app.clocks.find((c) => c.profile_id === app.user.profileId && !c.clock_out_at)
	);
</script>

<svelte:head><title>Today · Guad</title></svelte:head>
<div class="stack">
	<InstallPrompt />
	<div class="spread">
		<div class="stack">
			<p class="eyebrow">A little care, well recorded</p>
			<h1>Hello, {app.user.name.split(' ')[0]}.</h1>
			<p class="muted">{shiftName.label} shift · {shiftName.start} to {shiftName.end}</p>
		</div>
		<span class="pill">{clock ? 'Clocked in' : 'Not clocked in'}</span>
	</div>
	<GettingStarted />
	<ClockPanel />
	<CoverageOffers />
	{#if countsDue || toCountersign}<a class="card pad row" href={resolve('/(app)/controlled')}
			><span class="grow"
				><b>Controlled medications</b><span
					>{[
						countsDue ? `${countsDue} to count this shift` : '',
						toCountersign ? `${toCountersign} waiting for your countersignature` : ''
					]
						.filter(Boolean)
						.join(' · ')}</span
				></span
			><span class="pill due">Open</span></a
		>{/if}
	<div class="card pad stack">
		<div class="spread">
			<b>Notes this shift</b><span class="muted">{completed} of {people.length} done</span>
		</div>
		<div
			class="progress"
			role="progressbar"
			aria-label="Notes completed"
			aria-valuenow={completed}
			aria-valuemin="0"
			aria-valuemax={people.length || 1}
		>
			<span style:width={`${people.length ? (completed / people.length) * 100 : 0}%`}></span>
		</div>
		{#if people.length && completed === people.length}<p class="all-done" role="status">
				<span class="orb bounce" aria-hidden="true">◒</span> All notes done for this shift. Thank you.
			</p>{/if}
	</div>
	<div class="section-title">
		<h2>People you support</h2>
		<span class="muted">{app.homes.find((h) => h.id === app.homeId)?.name ?? 'Your home'}</span>
	</div>
	<div class="grid" data-testid="people">
		{#each people as person (person.id)}{@const note = notes.find((n) => n.client_id === person.id)}
			<a class="card person-row" href={resolve('/(app)/people/[id]', { id: person.id })}
				><span class="avatar">{person.initials || person.name?.slice(0, 2)}</span><span class="grow"
					><b>{person.name}</b><small
						>{note?.status === 'returned'
							? 'Your supervisor left feedback'
							: note?.status === 'draft'
								? 'Continue your draft'
								: note
									? 'Care recorded for this shift'
									: 'Ready when you are'}</small
					></span
				><span
					class:bad={note?.status === 'returned'}
					class:ok={note?.status === 'approved' || note?.status === 'submitted'}
					class:due={!note || note.status === 'draft'}
					class="pill"
					>{note?.status === 'returned'
						? 'Fix'
						: note?.status === 'approved' || note?.status === 'submitted'
							? 'Done'
							: 'To do'}</span
				></a
			>
		{:else}<div class="card empty">
				{app.homes.length
					? 'No people are assigned to this home.'
					: 'Your homes will appear after the first sync.'}
			</div>{/each}
	</div>
</div>
