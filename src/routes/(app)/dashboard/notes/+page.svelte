<script lang="ts">
	import { page } from '$app/state';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import {
		reviewList,
		reviewStatusLabel,
		sectionChanges,
		type ReviewFilter
	} from '#lib/domain/index.ts';
	const app = useSession();
	type Versions = Awaited<ReturnType<typeof trpc.note.versions.mutate>>['versions'];
	// Earlier signed versions (frontend-audit.md finding 14), loaded on request.
	let versions = $state<{ noteId: string; list: Versions } | null>(null);
	let loadingVersions = $state(false);
	let selected = $state('');
	let comment = $state('');
	let signature = $state(false);
	let busy = $state(false);
	let message = $state('');
	// Filter bar (frontend-spec-3.md §4.2): to review by default.
	// The overview links here with ?show=&from=&to= (a status and dates only, no PHI).
	const params = page.url.searchParams;
	const DAY = /^\d{4}-\d{2}-\d{2}$/;
	const SHOW: ReviewFilter[] = ['submitted', 'all', 'approved', 'returned'];
	const day = (v: string | null) => (v && DAY.test(v) ? v : '');
	let filter = $state<ReviewFilter>(SHOW.find((f) => f === params.get('show')) ?? 'submitted');
	let search = $state('');
	let from = $state(day(params.get('from')));
	let to = $state(day(params.get('to')));
	let sort = $state<'newest' | 'oldest'>('newest');
	/** On narrow screens the list and the note take turns (frontend-audit finding 20). */
	let picked = $state(false);
	const FILTERS: { value: ReviewFilter; label: string }[] = [
		{ value: 'submitted', label: 'To review' },
		{ value: 'all', label: 'All' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'returned', label: 'Sent back' }
	];
	const personName = (id: string | null) => app.people.find((p) => p.id === id)?.name ?? 'Person';
	const list = $derived(
		reviewList(
			app.notes.filter((n) => n.home_id === app.homeId),
			{ status: filter, search, from: from || undefined, to: to || undefined, sort },
			personName
		)
	);
	const note = $derived(list.find((n) => n.id === selected) ?? list[0]);
	const pillClass = (status: string | null) =>
		status === 'approved' ? 'ok' : status === 'returned' ? 'bad' : '';
	const content = $derived(parseJson<Record<string, unknown>>(note?.content, {}));
	$effect(() => {
		if (note?.id) {
			selected = note.id;
			comment = '';
			signature = false;
			// The message stays: "Note approved." must outlive the move to the next note.
			if (versions?.noteId !== note.id) versions = null;
		}
	});
	const changes = $derived.by(() => {
		const list = versions?.list ?? [];
		if (list.length < 2) return null;
		const [before, after] = list.slice(-2);
		return { before, after, sections: sectionChanges(before.content, after.content) };
	});
	async function showVersions() {
		if (!note || loadingVersions) return;
		const id = note.id;
		loadingVersions = true;
		message = '';
		try {
			const { versions: list } = await trpc.note.versions.mutate({ id });
			if (note?.id === id) versions = { noteId: id, list };
		} catch {
			message = 'Earlier versions need a connection. Reconnect and try again.';
		} finally {
			loadingVersions = false;
		}
	}
	const when = (iso: string) => new Date(iso).toLocaleString();
	async function review(action: 'approve' | 'return') {
		if (!note || busy) return;
		if (!app.db?.currentStatus.connected) {
			message = 'Reconnect to review this note. You can still read it offline.';
			return;
		}
		if (note.author_id === app.user.profileId) {
			message = 'Another supervisor must review your own note.';
			return;
		}
		busy = true;
		message = '';
		try {
			const done = note.id;
			if (action === 'approve') await trpc.note.approve.mutate({ id: done });
			else await trpc.note.sendBack.mutate({ id: done, comment });
			// Approve and next: the next note waiting for review, in list order.
			const at = list.findIndex((n) => n.id === done);
			const waiting = (n: (typeof list)[number]) => n.status === 'submitted' && n.id !== done;
			const next = list.slice(at + 1).find(waiting) ?? list.find(waiting);
			selected = next?.id ?? '';
			if (!next) picked = false;
			signature = false;
			comment = '';
			message = action === 'approve' ? 'Note approved.' : 'Note returned with your feedback.';
		} catch {
			message = 'Could not complete the review. Refresh the note and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Review notes · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Care records</p>
	<h1>Read, review, reassure.</h1>
	<p class="muted">Review each note before approving. Your own notes need another supervisor.</p>
	<div
		class="filters"
		role="search"
		aria-label="Filter notes"
		oninput={() => (picked = false)}
		onchange={() => (picked = false)}
	>
		<div class="seg" role="group" aria-label="Show notes">
			{#each FILTERS as f (f.value)}<button
					type="button"
					aria-pressed={filter === f.value}
					onclick={() => {
						filter = f.value;
						selected = '';
						picked = false;
						message = '';
					}}>{f.label}</button
				>{/each}
		</div>
		<label
			>Search<input
				class="input"
				type="search"
				bind:value={search}
				placeholder="Person or author"
			/></label
		>
		<label>From<input class="input" type="date" bind:value={from} /></label>
		<label>To<input class="input" type="date" bind:value={to} /></label>
		<label
			>Sort<select class="input" bind:value={sort}
				><option value="newest">Newest first</option><option value="oldest">Oldest first</option
				></select
			></label
		>
	</div>
	<p class="muted s13" role="status">
		{list.length}
		{list.length === 1 ? 'note' : 'notes'} · notes saved on this device (about 30 days)
	</p>
	<div class="review-layout" class:picked={picked && !!note}>
		<div class="stack note-list">
			{#each list as item (item.id)}<button
					class="record-choice"
					aria-pressed={note?.id === item.id}
					onclick={() => {
						selected = item.id;
						picked = true;
						message = '';
					}}
					><b>{personName(item.client_id)}</b><span
						>{item.type === 'behavior' ? 'Behavior note' : 'Shift note'} · {item.author_name} · {item.day}</span
					><span class="pill {pillClass(item.status)}">{reviewStatusLabel(item.status)}</span
					></button
				>{:else}<div class="card empty">
					{filter === 'submitted' && !search && !from && !to
						? 'No notes waiting for review.'
						: 'No notes match these filters.'}
				</div>{/each}
		</div>
		{#if note}<article class="card pad stack note-detail">
				<button type="button" class="textbtn back" onclick={() => (picked = false)}
					>← All notes</button
				>
				<div class="spread">
					<div>
						<h2>{personName(note.client_id)}</h2>
						<p class="muted">{note.author_name} · {note.day} · {note.shift?.toUpperCase()}</p>
					</div>
					<span class="pill {pillClass(note.status)}">{reviewStatusLabel(note.status)}</span>
				</div>
				{#if note.status === 'returned' && note.supervisor_comment}<p class="callout">
						Sent back: {note.supervisor_comment}
					</p>{/if}
				{#if note.lomi_drafted}<span class="pill">AI-assisted · reviewed and signed by staff</span
					>{/if}
				{#if versions?.noteId !== note.id}<button
						class="textbtn"
						disabled={loadingVersions}
						onclick={showVersions}>{loadingVersions ? 'Loading…' : 'Show earlier versions'}</button
					>{:else if !changes}<p class="muted">
						This is the first signed version; there is nothing earlier to compare.
					</p>{:else}<section
						class="versions stack"
						aria-label="Changes since the last signed version"
					>
						<h3>
							Changes since version {changes.before.number} ({when(changes.before.at)})
						</h3>
						{#each changes.sections as change (change.section)}<div>
								<h4>{change.section}</h4>
								<p class="record-text">
									{#each change.parts as part, i (i)}{#if part.kind === 'same'}{part.text}{:else if part.kind === 'added'}<ins
												>{part.text}</ins
											>{:else}<del>{part.text}</del>{/if}{/each}
								</p>
							</div>{:else}<p class="muted">
								The text is unchanged; only goal data or the signature changed.
							</p>{/each}
						<details>
							<summary>All signed versions ({versions.list.length})</summary>
							<ol>
								{#each versions.list as v (v.number)}<li>
										Version {v.number}: signed {when(v.at)}{v.by ? ` by ${v.by}` : ''}
									</li>{/each}
							</ol>
						</details>
					</section>{/if}
				{#each Object.entries(content) as [section, text] (section)}<section class="record-section">
						<h3>{section}</h3>
						<p class="record-text">{typeof text === 'string' ? text : JSON.stringify(text)}</p>
					</section>{/each}
				{#each app.noteGoals.filter((g) => g.note_id === note?.id) as goal (goal.id)}<section
						class="record-section"
					>
						<h3>{app.goals.find((g) => g.id === goal.goal_id)?.text ?? app.labels.goalsNav}</h3>
						<p>
							{goal.not_attempted
								? `Not attempted: ${goal.reason}`
								: parseJson<string[]>(goal.trials, []).join(', ')}
						</p>
					</section>{/each}
				{#if note.status === 'submitted'}
					<label class="checkline"
						><input type="checkbox" bind:checked={signature} disabled={busy} />I have read this note
						and approve this care record.</label
					><button
						class="btn"
						disabled={busy || !signature || note.author_id === app.user.profileId}
						onclick={() => review('approve')}>{app.labels.approve}</button
					><label
						>Feedback for the author<textarea
							class="input"
							bind:value={comment}
							maxlength="2000"
							disabled={busy}
							placeholder="Explain what needs to be clarified or corrected."></textarea></label
					><button
						class="btn sec"
						disabled={busy || !comment.trim() || note.author_id === app.user.profileId}
						onclick={() => review('return')}>{app.labels.sendBack}</button
					>
				{:else}<p class="muted">
						{note.status === 'approved'
							? 'Approved notes are read-only.'
							: 'Waiting for the author to revise and sign again.'}
					</p>{/if}
			</article>{/if}
	</div>
	{#if message}<p role="status" class="callout">{message}</p>{/if}
</div>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 12px;
		align-items: end;
	}
	.filters label {
		flex: 1 1 140px;
	}
	.filters .seg {
		flex: 1 1 100%;
	}
	.record-choice .pill {
		margin-top: 6px;
	}
	.back {
		display: none;
		align-self: flex-start;
	}
	/* Narrow screens: the list, or the chosen note with a way back. */
	@media (max-width: 900px) {
		.picked .note-list {
			display: none;
		}
		.review-layout:not(.picked) .note-detail {
			display: none;
		}
		.back {
			display: inline-flex;
		}
	}
	.versions {
		border: 1px solid var(--line2);
		border-radius: 16px;
		padding: 14px 16px;
	}
	.versions h3,
	.versions h4 {
		margin: 0;
	}
	.versions h4 {
		font-size: 14px;
		color: var(--muted);
		text-transform: capitalize;
	}
	/* Colour plus underline / strikethrough, so the change reads without colour. */
	ins {
		background: var(--ok-bg);
		color: var(--ok);
		text-decoration: underline;
	}
	del {
		background: var(--bad-bg);
		color: var(--bad);
		text-decoration: line-through;
	}
</style>
