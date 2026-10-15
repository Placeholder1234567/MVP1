<script lang="ts">
	import { useSession } from '#lib/app/session.svelte.ts';
	const app = useSession();
	let draft = $state('');
	let error = $state('');
	let busy = $state(false);
	const messages = $derived(app.messages.filter((m) => m.home_id === app.homeId));
	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (!app.db || !app.homeId || !draft.trim()) return;
		busy = true;
		error = '';
		try {
			const now = new Date().toISOString();
			await app.db.execute(
				'INSERT INTO messages (id, home_id, from_name, body, sent_at, created_at, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)',
				[app.homeId, app.user.name, draft.trim(), now, now, now]
			);
			draft = '';
		} catch {
			error = 'Could not save your message. Your text is still here.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Team messages · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Stay connected</p>
	<h1>Your team, together.</h1>
	<form class="card pad stack" onsubmit={send}>
		<label
			>Message your team<textarea class="input" maxlength="2000" required bind:value={draft}
			></textarea></label
		><button class="btn" disabled={busy || !app.homeId}>Save message</button>
		<p class="muted">Messages saved offline are sent when you reconnect.</p>
		{#if error}<p role="alert">{error}</p>{/if}
	</form>
	<div data-testid="board" class="stack">
		{#each messages as message (message.id)}<article class="card pad">
				<div class="spread">
					<b>{message.from_name}</b><small class="muted"
						>{message.sent_at ? new Date(message.sent_at).toLocaleString() : ''}</small
					>
				</div>
				<p class="record-text">{message.body}</p>
			</article>{:else}<p class="empty">No messages for this home yet.</p>{/each}
	</div>
</div>
