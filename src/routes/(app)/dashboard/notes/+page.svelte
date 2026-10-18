<script lang="ts">
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { sectionChanges } from '#lib/domain/index.ts';
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
	const pending = $derived(
		app.notes.filter((n) => n.home_id === app.homeId && n.status === 'submitted')
	);
	const note = $derived(pending.find((n) => n.id === selected) ?? pending[0]);
	const content = $derived(parseJson<Record<string, unknown>>(note?.content, {}));
	$effect(() => {
		if (note?.id) {
			selected = note.id;
			comment = '';
			signature = false;
			message = '';
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
			if (action === 'approve') await trpc.note.approve.mutate({ id: note.id });
			else await trpc.note.sendBack.mutate({ id: note.id, comment });
			selected = '';
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
	<div class="review-layout">
		<div class="stack">
			{#each pending as item (item.id)}<button
					class="record-choice"
					aria-pressed={note?.id === item.id}
					onclick={() => (selected = item.id)}
					><b>{app.people.find((p) => p.id === item.client_id)?.name ?? 'Person'}</b><span
						>{item.author_name} · {item.day}</span
					></button
				>{:else}<div class="card empty">No notes waiting for review.</div>{/each}
		</div>
		{#if note}<article class="card pad stack">
				<div>
					<h2>{app.people.find((p) => p.id === note.client_id)?.name}</h2>
					<p class="muted">{note.author_name} · {note.day} · {note.shift?.toUpperCase()}</p>
				</div>
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
			</article>{/if}
	</div>
	{#if message}<p role="status" class="callout">{message}</p>{/if}
</div>

<style>
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
