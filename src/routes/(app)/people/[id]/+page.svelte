<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	const app = useSession();
	const person = $derived(app.people.find((p) => p.id === page.params.id));
	const goals = $derived(app.goals.filter((g) => g.client_id === person?.id && !g.stopped_at));
</script>

<svelte:head><title>Person · Guad</title></svelte:head>
<div class="stack">
	<a class="textbtn" href={resolve('/(app)/today')}>← Back to today</a>
	{#if person}<div class="spread">
			<div>
				<p class="eyebrow">Care records</p>
				<h1>{person.name}</h1>
			</div>
			<span class="avatar">{person.initials || person.name?.slice(0, 2)}</span>
		</div>
		<div class="grid">
			<a class="card person-row" href={resolve('/(app)/people/[id]/note', { id: person.id })}
				><span class="grow"
					><b>{app.labels.shift}</b><small>Record activities, meals, mood and health</small></span
				>→</a
			><a class="card person-row" href={resolve('/(app)/people/[id]/behavior', { id: person.id })}
				><span class="grow"
					><b>{app.labels.behavior}</b><small>Before, what happened, response and outcome</small
					></span
				>→</a
			>
		</div>
		<h2>{app.labels.goals}</h2>
		{#each goals as goal (goal.id)}<div class="card pad">
				<b>{goal.area}</b>
				<p>{goal.text}</p>
			</div>{:else}<p class="muted">No active goals have been assigned.</p>{/each}
	{:else}<div class="card empty">
			This person is not available on your device. Check your selected home or wait for sync.
		</div>{/if}
</div>
