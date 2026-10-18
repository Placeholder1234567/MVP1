<script lang="ts">
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { seenBy, seenByLabel, unseenMessages } from '#lib/domain/index.ts';
	const app = useSession();
	let draft = $state('');
	// The person this message is about, if any (shown on their page).
	let about = $state('');
	let error = $state('');
	let busy = $state(false);
	let visible = $state(typeof document === 'undefined' || document.visibilityState === 'visible');
	const messages = $derived(app.messages.filter((m) => m.home_id === app.homeId));
	const unseen = $derived(
		unseenMessages(app.messages, app.messageReads, app.user.profileId, app.homeId)
	);
	// Showing the board while the page is visible counts as reading it (finding 19).
	// Receipts are written locally and upload like any other offline change.
	let marking = false;
	$effect(() => {
		const db = app.db;
		const list = unseen;
		if (!db || !visible || !list.length || marking) return;
		marking = true;
		const now = new Date().toISOString();
		db.writeTransaction(async (tx) => {
			for (const m of list)
				await tx.execute(
					'INSERT INTO message_reads (id, home_id, message_id, profile_id, reader_name, read_at, created_at, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)',
					[m.home_id, m.id, app.user.profileId, app.user.name, now, now, now]
				);
		})
			.catch(() => {
				/* Not seen yet; the next visit tries again. */
			})
			.finally(() => (marking = false));
	});
	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (!app.db || !app.homeId || !draft.trim()) return;
		busy = true;
		error = '';
		try {
			const now = new Date().toISOString();
			await app.db.execute(
				'INSERT INTO messages (id, home_id, client_id, from_name, body, sent_at, created_by, created_at, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?)',
				[
					app.homeId,
					app.currentPeople.some((p) => p.id === about) ? about : null,
					app.user.name,
					draft.trim(),
					now,
					app.user.profileId,
					now,
					now
				]
			);
			draft = '';
			about = '';
		} catch {
			error = 'Could not save your message. Your text is still here.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:document onvisibilitychange={() => (visible = document.visibilityState === 'visible')} />
<svelte:head><title>Team messages · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Stay connected</p>
	<h1>Your team, together.</h1>
	<form class="card pad stack" onsubmit={send}>
		<label
			>Message your team<textarea class="input" maxlength="2000" required bind:value={draft}
			></textarea></label
		><label
			>About (optional)<select class="input" bind:value={about}
				><option value="">Nobody in particular</option>{#each app.currentPeople as p (p.id)}<option
						value={p.id}>{p.name}</option
					>{/each}</select
			></label
		><button class="btn" disabled={busy || !app.homeId}>Save message</button>
		<p class="muted">Messages saved offline are sent when you reconnect.</p>
		{#if error}<p role="alert">{error}</p>{/if}
	</form>
	<div data-testid="board" class="stack">
		{#each messages as message (message.id)}{@const readers = seenBy(
				message,
				app.messageReads
			)}{@const person = app.people.find((p) => p.id === message.client_id)}
			<article class="card pad">
				<div class="spread">
					<b>{message.from_name}</b><small class="muted"
						>{message.sent_at ? new Date(message.sent_at).toLocaleString() : ''}</small
					>
				</div>
				{#if person}<p class="s13">
						About <a href={resolve('/(app)/people/[id]', { id: person.id })}>{person.name}</a>
					</p>{/if}
				<p class="record-text">{message.body}</p>
				{#if message.created_by === app.user.profileId || readers.length}<details class="seen">
						<summary class="muted s13">{seenByLabel(readers.map((r) => r.name))}</summary>
						{#if readers.length}<ul>
								{#each readers as r (r.profileId)}<li>
										{r.name} <span class="muted">· {new Date(r.at).toLocaleString()}</span>
									</li>{/each}
							</ul>{:else}<p class="muted s13">
								Nobody has opened the board since you posted.
							</p>{/if}
					</details>{/if}
			</article>{:else}<p class="empty">No messages for this home yet.</p>{/each}
	</div>
</div>

<style>
	.seen {
		margin-top: 8px;
	}
	.seen summary {
		cursor: pointer;
		min-height: 32px;
		display: flex;
		align-items: center;
	}
	.seen ul {
		margin: 4px 0 0;
		padding-left: 18px;
	}
</style>
