<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import PrivacyShield from './PrivacyShield.svelte';
	import { openDb, closeDb } from '#lib/sync/db.ts';
	import { resolve } from '$app/paths';
	import type { PowerSyncDatabase } from '@powersync/web';
	import { provideSession, type AppUser } from './session.svelte';
	import NoteEditor from './NoteEditor.svelte';
	import ClinicalWorkspace from './ClinicalWorkspace.svelte';
	let { user, db, expiresAt }: { user: AppUser; db: PowerSyncDatabase; expiresAt: number } =
		$props();
	const app = provideSession(untrack(() => user));
	let clientId = $state('');
	let noteId = $state('');
	let clinicalId = $state('');
	let type = $state<'shift' | 'behavior'>('shift');
	const notes = $derived(app.notes.filter((n) => n.home_id === app.homeId).slice(0, 30));
	onMount(() => {
		app.connect(db);
		return () => app.dispose();
	});
</script>

<svelte:head><title>Saved care records · Guad</title></svelte:head>
<PrivacyShield
	profileId={user.profileId}
	onReady={(lock) => {
		app.lock = lock;
	}}
	offline
	onLock={async () => {
		app.dispose();
		await closeDb();
	}}
	onUnlock={async (key, onWait) => {
		app.connect(await openDb(key, user.profileId, { offline: true, onWait }));
	}}
>
	<main class="saved-workspace stack">
		<div class="spread">
			<span class="wordmark">Guad<span class="lemon-dot">●</span></span><button
				class="btn sec"
				onclick={() => app.lock()}>Lock device</button
			>
		</div>
		<p class="callout">
			Saved workspace · {app.user.name}. Records reflect your last sync. New notes stay encrypted on
			this device until you return to the connected app and sync. Saved access expires at {new Date(
				expiresAt
			).toLocaleTimeString()}; save your work before then.
		</p>
		<a class="textbtn" href={resolve('/')} data-sveltekit-reload>Reconnect and sync →</a>
		{#if clinicalId}<ClinicalWorkspace
				clientId={clinicalId}
				onBack={() => (clinicalId = '')}
			/>{:else if clientId || noteId}<NoteEditor
				{clientId}
				{noteId}
				{type}
				offlineOnly
				onBack={() => {
					clientId = '';
					noteId = '';
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
				{app.pending} changes waiting to sync. Reconnect before access expires to refresh your records
				and permissions.
			</p>
			{#each app.currentPeople as person (person.id)}<article class="card pad stack">
					<h2>{person.name}</h2>
					<div class="actions">
						<button class="btn sec" onclick={() => (clinicalId = person.id)}>Care record</button>
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
						>{note.type === 'behavior' ? app.labels.behavior : app.labels.shift} · {note.day} · {note.shift?.toUpperCase()}
						· {note.status}</span
					><span
						>{app.staff.find((person) => person.id === note.author_id)?.name ??
							'Saved staff member'}</span
					></button
				>{:else}<p class="muted">No saved notes for this home.</p>{/each}
		{/if}
	</main>
</PrivacyShield>

<style>
	.saved-workspace {
		max-width: 900px;
		margin: 0 auto;
		padding: 24px 18px 70px;
	}
</style>
