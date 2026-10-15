<script lang="ts">
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	const app = useSession();
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
		}
	});
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
				{#each Object.entries(content) as [section, text] (section)}<section class="record-section">
						<h3>{section}</h3>
						<p class="record-text">{typeof text === 'string' ? text : JSON.stringify(text)}</p>
					</section>{/each}
				{#each app.noteGoals.filter((g) => g.note_id === note?.id) as goal (goal.id)}<section
						class="record-section"
					>
						<h3>{app.goals.find((g) => g.id === goal.goal_id)?.text ?? app.labels.goals}</h3>
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
					onclick={() => review('approve')}>Approve note</button
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
					onclick={() => review('return')}>Return with feedback</button
				>
			</article>{/if}
	</div>
	{#if message}<p role="status" class="callout">{message}</p>{/if}
</div>
