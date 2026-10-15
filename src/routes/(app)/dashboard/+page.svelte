<script lang="ts">
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { localTime } from '#lib/domain/index.ts';
	const app = useSession();
	const today = localTime(new Date(), app.user.timeZone).day;
	const notes = $derived(app.notes.filter((n) => n.home_id === app.homeId));
	const pending = $derived(notes.filter((n) => n.status === 'submitted'));
	const returned = $derived(notes.filter((n) => n.status === 'returned'));
	const signed = $derived(
		notes.filter(
			(n) =>
				n.created_at &&
				localTime(new Date(n.created_at), app.user.timeZone).day === today &&
				['submitted', 'approved'].includes(n.status ?? '')
		)
	);
</script>

<svelte:head><title>Overview · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Your home at a glance</p>
	<h1>A clearer picture of care.</h1>
	<p class="muted">
		Documentation and attention for {app.homes.find((h) => h.id === app.homeId)?.name ??
			'your home'}.
	</p>
	<div class="stats">
		<div class="card pad">
			<p class="muted">To review</p>
			<p class="stat-number">{pending.length}</p>
		</div>
		<div class="card pad">
			<p class="muted">Signed today</p>
			<p class="stat-number">{signed.length}</p>
		</div>
		<div class="card pad">
			<p class="muted">Returned</p>
			<p class="stat-number">{returned.length}</p>
		</div>
	</div>
	<div class="section-title">
		<h2>Needs your review</h2>
		<a class="textbtn" href={resolve('/(app)/dashboard/notes')}>Review notes →</a>
	</div>
	{#each pending.slice(0, 5) as note (note.id)}<a
			class="card person-row"
			href={resolve('/(app)/dashboard/notes')}
			><span class="grow"
				><b>{app.people.find((p) => p.id === note.client_id)?.name ?? 'Person'}</b><small
					>{note.author_name} · {note.day} · {note.shift?.toUpperCase()}</small
				></span
			><span class="pill">To review</span></a
		>{:else}<div class="card empty">
			You’re all caught up. Submitted notes will appear here.
		</div>{/each}
</div>
