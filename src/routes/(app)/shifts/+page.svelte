<script lang="ts">
	import { useSession } from '#lib/app/session.svelte.ts';
	import { localTime, SHIFTS } from '#lib/domain/index.ts';
	const app = useSession();
	const today = localTime(new Date(), app.user.timeZone).day;
	const shifts = $derived(
		app.shifts.filter(
			(s) =>
				s.day! >= today &&
				(app.user.role !== 'caregiver' || s.assigned_to === app.user.profileId) &&
				s.home_id === app.homeId
		)
	);
</script>

<svelte:head><title>Shifts · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Plan your week</p>
	<h1>Your upcoming shifts.</h1>
	{#each shifts as shift (shift.id)}<div class="card person-row">
			<span class="grow"
				><b>{shift.day} · {SHIFTS.find((s) => s.key === shift.shift)?.label}</b><small
					>{app.homes.find((h) => h.id === shift.home_id)?.name}</small
				></span
			><span class="pill">{shift.status}</span>
		</div>{:else}<div class="card empty">No upcoming shifts for this home.</div>{/each}
</div>
