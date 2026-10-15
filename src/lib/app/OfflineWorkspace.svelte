<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PowerSyncDatabase } from '@powersync/web';
	import { provideSession, type AppUser } from './session.svelte';
	import NoteEditor from './NoteEditor.svelte';
	let {
		user,
		db,
		expiresAt,
		onLock
	}: { user: AppUser; db: PowerSyncDatabase; expiresAt: number; onLock: () => Promise<void> } =
		$props();
	const app = provideSession(untrack(() => user));
	let clientId = $state('');
	let noteId = $state('');
	let type = $state<'shift' | 'behavior'>('shift');
	let dirty = $state(false);
	const notes = $derived(app.notes.filter((n) => n.home_id === app.homeId).slice(0, 30));
	onMount(() => {
		app.connect(db);
		return () => app.dispose();
	});
	async function lock() {
		if (!dirty || confirm('Discard your unsaved text and lock this device?')) await onLock();
	}
</script>

<svelte:head><title>Saved care records · Guad</title></svelte:head>
<main class="saved-workspace stack">
	<div class="spread">
		<span class="wordmark">Guad<span class="lemon-dot">●</span></span><button
			class="btn sec"
			onclick={lock}>Lock device</button
		>
	</div>
	<p class="callout">
		Saved workspace · {app.user.name}. Records reflect your last sync. New notes stay encrypted on
		this device until you return to the connected app and sync. Saved access expires at {new Date(
			expiresAt
		).toLocaleTimeString()}; save your work before then.
	</p>
	<a class="textbtn" href={resolve('/')} data-sveltekit-reload>Reconnect and sync →</a>
	{#if clientId || noteId}<NoteEditor
			{clientId}
			{noteId}
			{type}
			offlineOnly
			onDirtyChange={(value) => (dirty = value)}
			onBack={() => {
				clientId = '';
				noteId = '';
				dirty = false;
			}}
		/>{:else}
		<h1>Care within reach.</h1>
		<label
			>Home<select class="input" bind:value={app.homeId}
				>{#each app.homes as home (home.id)}<option value={home.id}>{home.name}</option
					>{/each}</select
			></label
		>
		<p class="muted">
			{app.pending} changes waiting to sync. Reconnect before access expires to refresh your records and
			permissions.
		</p>
		{#each app.currentPeople as person (person.id)}<article class="card pad stack">
				<h2>{person.name}</h2>
				<div class="actions">
					<button
						class="btn"
						onclick={() => {
							clientId = person.id;
							type = 'shift';
						}}>Write {app.labels.shift}</button
					><button
						class="btn sec"
						onclick={() => {
							clientId = person.id;
							type = 'behavior';
						}}>Write {app.labels.behavior}</button
					>
				</div>
			</article>{:else}<p class="card empty">
				No people were saved for this home. Reconnect to finish preparing this device.
			</p>{/each}
		<h2>Saved notes</h2>
		{#each notes as note (note.id)}<button
				class="card pad record-choice"
				onclick={() => (noteId = note.id)}
				><b>{app.people.find((p) => p.id === note.client_id)?.name ?? 'Saved record'}</b><span
					>{note.day} · {note.shift?.toUpperCase()} · {note.status}</span
				></button
			>{:else}<p class="muted">No saved notes for this home.</p>{/each}
	{/if}
</main>

<style>
	.saved-workspace {
		max-width: 900px;
		margin: 0 auto;
		padding: 24px 18px 70px;
	}
</style>
