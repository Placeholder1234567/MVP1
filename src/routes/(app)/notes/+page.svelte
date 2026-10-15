<script lang="ts">
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	const app = useSession();
	const notes = $derived(
		app.notes.filter((n) => n.author_id === app.user.profileId && n.home_id === app.homeId)
	);
</script>

<svelte:head><title>Notes · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Your care records</p>
	<h1>A record of your care.</h1>
	<p class="muted">Drafts, signed notes and supervisor feedback.</p>
	{#each notes as note (note.id)}<a
			class="card person-row"
			href={resolve('/(app)/notes/[id]', { id: note.id })}
			><span class="grow"
				><b>{app.people.find((p) => p.id === note.client_id)?.name ?? 'Person'}</b><small
					>{note.type === 'behavior' ? app.labels.behavior : app.labels.shift} · {note.day} · {note.shift?.toUpperCase()}</small
				></span
			><span class="pill" class:bad={note.status === 'returned'}>{note.status}</span></a
		>{:else}<div class="card empty">Your saved notes will appear here.</div>{/each}
</div>
