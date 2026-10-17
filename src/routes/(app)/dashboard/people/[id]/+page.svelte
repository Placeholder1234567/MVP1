<script lang="ts">
	// A person, for supervisors (frontend-spec-3.md §4.7 "Tab: Case Notes"):
	// case notes for care coordination, ISP meetings and family calls. Daily
	// care records stay on the person's care page. Case notes need a
	// connection and aren't synced to devices.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';

	type Note = Awaited<ReturnType<typeof trpc.caseNote.list.query>>[number];
	const PAGE = 50;
	const app = useSession();
	const id = $derived(page.params.id ?? '');
	const person = $derived(app.people.find((c) => c.id === id));
	const home = $derived(app.homes.find((h) => h.id === person?.home_id));
	const charting = $derived(
		((page.data.user?.features ?? []) as readonly string[]).includes('charting')
	);

	let notes = $state<Note[]>([]);
	let body = $state('');
	let busy = $state(false);
	let loaded = $state(false);
	let more = $state(false);
	let message = $state('');

	async function load(append = false) {
		busy = true;
		try {
			const rows = await trpc.caseNote.list.query({
				clientId: id,
				limit: PAGE,
				offset: append ? notes.length : 0
			});
			notes = append ? [...notes, ...rows] : rows;
			more = rows.length === PAGE;
			loaded = true;
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connect to load case notes.';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		if (charting) void load();
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const created = await trpc.caseNote.create.mutate({ clientId: id, body });
			notes = [created, ...notes];
			body = '';
			message = 'Case note saved.';
		} catch (e) {
			// Keep the text so nothing typed is lost.
			message = e instanceof Error ? e.message : 'Could not save. Your text is kept here.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{person?.name ?? 'Person'} · Guad</title></svelte:head>

<section class="stack" aria-label="Person">
	<a href={resolve('/(app)/dashboard/people')}>← People</a>
	<div class="spread">
		<div>
			<h1>{person?.name ?? 'Person'}</h1>
			<p class="muted">{home?.name ?? 'No home yet'}</p>
		</div>
		<a class="btn sec" href={resolve('/(app)/people/[id]', { id })}>Care records</a>
	</div>

	{#if !charting}
		<p class="muted">Case notes are part of the care records plan.</p>
	{:else}
		<h2>Case notes</h2>
		<p class="muted">
			Meetings, calls, plan changes. Notes can't be edited later; add a new note to correct one.
		</p>
		<form class="card pad stack" onsubmit={save}>
			<label
				>New case note<textarea
					class="input"
					rows="4"
					maxlength="10000"
					required
					placeholder="Meetings, calls, plan changes"
					bind:value={body}
					disabled={busy}></textarea></label
			>
			<div class="actions">
				<button class="btn" disabled={busy || !body.trim()}>Save case note</button>
			</div>
		</form>
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		<div class="list card" aria-label="Case note history">
			{#each notes as note (note.id)}
				<div class="row">
					<span class="grow"
						><b>{note.authorName ?? 'Staff'} · {new Date(note.createdAt).toLocaleString()}</b><span
							class="note-body">{note.body}</span
						></span
					>
				</div>
			{:else}
				<div class="row muted">{loaded ? 'No case notes yet.' : 'Loading…'}</div>
			{/each}
		</div>
		{#if more}<button class="btn sec" disabled={busy} onclick={() => load(true)}>Older notes</button
			>{/if}
	{/if}
</section>

<style>
	.note-body {
		white-space: pre-wrap;
	}
</style>
