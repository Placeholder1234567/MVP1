<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { dayTimeOf } from '#lib/app/clinical-write.ts';
	import { boardThreads, seenBy, seenByLabel, unseenMessages } from '#lib/domain/index.ts';
	const app = useSession();
	const tz = app.user.timeZone;
	let draft = $state('');
	// The person this message is about, if any (shown on their page).
	let about = $state('');
	let error = $state('');
	let busy = $state(false);
	let visible = $state(typeof document === 'undefined' || document.visibilityState === 'visible');
	const messages = $derived(app.messages.filter((m) => m.home_id === app.homeId));
	const threads = $derived(boardThreads(messages));
	// "Discuss with the team" on an incident opens the board with ?incident=.
	const incident = $derived.by(() => {
		const id = page.url.searchParams.get('incident');
		return app.incidents.find((i) => i.id === id && i.home_id === app.homeId) ?? null;
	});
	let dropIncident = $state(false);
	const incidentLabel = (i: { type: string | null; occurred_at: string | null }) =>
		`${i.type ?? 'Incident'}, ${dayTimeOf(i.occurred_at, tz)}`;
	// The thread being replied to, and the reply's text.
	let replyingTo = $state<string | null>(null);
	let reply = $state('');
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
	/** Saves a message locally; it uploads through sync.upload, offline or not. */
	async function post(
		body: string,
		links: { clientId?: string | null; replyTo?: string | null; incidentId?: string | null }
	) {
		const now = new Date().toISOString();
		await app.db!.execute(
			'INSERT INTO messages (id, home_id, client_id, reply_to, incident_id, from_name, body, sent_at, created_by, created_at, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
			[
				app.homeId,
				links.clientId ?? null,
				links.replyTo ?? null,
				links.incidentId ?? null,
				app.user.name,
				body,
				now,
				app.user.profileId,
				now,
				now
			]
		);
	}
	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (!app.db || !app.homeId || !draft.trim()) return;
		busy = true;
		error = '';
		try {
			await post(draft.trim(), {
				clientId: app.currentPeople.some((p) => p.id === about)
					? about
					: !dropIncident && incident
						? incident.client_id
						: null,
				incidentId: !dropIncident && incident ? incident.id : null
			});
			draft = '';
			about = '';
			dropIncident = true;
		} catch {
			error = 'Could not save your message. Your text is still here.';
		} finally {
			busy = false;
		}
	}
	async function sendReply(event: SubmitEvent, rootId: string) {
		event.preventDefault();
		if (!app.db || !app.homeId || !reply.trim()) return;
		busy = true;
		error = '';
		try {
			await post(reply.trim(), { replyTo: rootId });
			reply = '';
			replyingTo = null;
		} catch {
			error = 'Could not save your reply. Your text is still here.';
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
		>{#if incident && !dropIncident}<p class="callout info s14">
				Follow-up on the incident: {incidentLabel(incident)}.
				<button type="button" class="textbtn" onclick={() => (dropIncident = true)}
					>Not about this incident</button
				>
			</p>{/if}<button class="btn" disabled={busy || !app.homeId}>Save message</button>
		<p class="muted">Messages saved offline are sent when you reconnect.</p>
		{#if error}<p role="alert">{error}</p>{/if}
	</form>
	<div data-testid="board" class="stack">
		{#each threads as thread (thread.root.id)}{@const root = thread.root}{@const person =
				app.people.find((p) => p.id === root.client_id)}{@const followUp = app.incidents.find(
				(i) => i.id === root.incident_id
			)}
			<article class="card pad stack thread" id="m-{root.id}">
				{@render card(root)}
				{#if thread.orphan}<p class="muted s13">Reply to an earlier message.</p>{/if}
				{#if followUp}<p class="s13">
						Follow-up on the incident: {incidentLabel(followUp)}{#if followUp.client_id}
							· <a href={resolve('/(app)/people/[id]/incident', { id: followUp.client_id })}
								>Open reports</a
							>{/if}
					</p>{:else if person}<p class="s13">
						About <a href={resolve('/(app)/people/[id]', { id: person.id })}>{person.name}</a>
					</p>{/if}
				{#if thread.replies.length}<ol class="replies" aria-label="Replies">
						{#each thread.replies as r (r.id)}<li>{@render card(r)}</li>{/each}
					</ol>{/if}
				{#if !thread.orphan}{#if replyingTo === root.id}<form
							class="stack"
							onsubmit={(e) => sendReply(e, root.id)}
						>
							<label
								>Your reply<textarea class="input" maxlength="2000" required bind:value={reply}
								></textarea></label
							>
							<div class="actions">
								<button class="btn" disabled={busy}>Save reply</button><button
									type="button"
									class="btn sec"
									onclick={() => (replyingTo = null)}>Cancel</button
								>
							</div>
						</form>{:else}<div class="actions">
							<button
								type="button"
								class="btn sec"
								onclick={() => {
									replyingTo = root.id;
									reply = '';
								}}
								>Reply{thread.replies.length
									? ` (${thread.replies.length} ${thread.replies.length === 1 ? 'reply' : 'replies'})`
									: ''}</button
							>
						</div>{/if}{/if}
			</article>{:else}<p class="empty">No messages for this home yet.</p>{/each}
	</div>
</div>

{#snippet card(message: (typeof messages)[number])}{@const readers = seenBy(
		message,
		app.messageReads
	)}
	<div class="spread">
		<b>{message.from_name}</b><small class="muted"
			>{message.sent_at ? new Date(message.sent_at).toLocaleString() : ''}</small
		>
	</div>
	<p class="record-text">{message.body}</p>
	{#if message.created_by === app.user.profileId || readers.length}<details class="seen">
			<summary class="muted s13">{seenByLabel(readers.map((r) => r.name))}</summary>
			{#if readers.length}<ul>
					{#each readers as r (r.profileId)}<li>
							{r.name} <span class="muted">· {new Date(r.at).toLocaleString()}</span>
						</li>{/each}
				</ul>{:else}<p class="muted s13">Nobody has opened the board since you posted.</p>{/if}
		</details>{/if}
{/snippet}

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
	.replies {
		list-style: none;
		margin: 0;
		padding: 0 0 0 14px;
		border-left: 3px solid var(--line2);
		display: grid;
		gap: 12px;
	}
	.seen ul {
		margin: 4px 0 0;
		padding-left: 18px;
	}
</style>
