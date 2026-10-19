<script lang="ts">
	// Changes the server refused and one-time sync messages (offline-sync.md §6
	// "Permanently Failed Writes", frontend-spec-2.md §8.3). The person can try
	// a refused change again or discard it; messages are dismissed once read.
	import { useSession } from '#lib/app/session.svelte.ts';
	import { failedLabel, type FailedWrite } from '#lib/sync/failed-writes.ts';

	const app = useSession();
	let open = $state(false);
	let busy = $state('');
	let status = $state('');
	// Start closed and quiet the next time something fails.
	$effect(() => {
		if (!app.failed.length) {
			open = false;
			status = '';
		}
	});

	const when = (at: string) =>
		new Date(at).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});

	async function retry(write: FailedWrite) {
		busy = write.id;
		try {
			const outcome = await app.retryFailed(write);
			status =
				outcome === 'queued'
					? 'Trying again. It saves when this device next syncs.'
					: outcome === 'wait'
						? 'This device is still catching up. Try again in a minute.'
						: 'There is nothing left to retry. Discard it, then enter it again if it is still needed.';
		} catch {
			status = 'Could not try again. Lock and unlock this device, then retry.';
		} finally {
			busy = '';
		}
	}

	async function discard(write: FailedWrite) {
		if (!confirm(`Discard this ${failedLabel(write.table_name).toLowerCase()}? It was not saved.`))
			return;
		busy = write.id;
		try {
			await app.discardFailed(write.id);
			status = 'Discarded.';
		} finally {
			busy = '';
		}
	}
</script>

{#each app.notices as n (n.id)}<div
		class="callout warn spread"
		role="status"
		data-testid="sync-notice"
	>
		<span>{n.message}</span>
		<button class="btn sec" onclick={() => app.dismissNotice(n.id)}>OK</button>
	</div>{/each}

{#if app.failed.length}<div class="callout bad stack" role="alert" data-testid="failed-writes">
		<div class="spread">
			<b
				>{app.failed.length}
				{app.failed.length === 1 ? 'change' : 'changes'} could not be saved.</b
			>
			<button class="btn sec" aria-expanded={open} onclick={() => (open = !open)}
				>{open ? 'Hide' : 'Review'}</button
			>
		</div>
		{#if open}
			<p class="s13">
				The server did not accept these. Try one again if what blocked it has changed, or discard
				it. Keep this device unlocked while you review them.
			</p>
			<ul class="failed">
				{#each app.failed as f (f.id)}<li>
						<b>{failedLabel(f.table_name)}</b>
						<span class="s13">{when(f.failed_at)} · {f.message}</span>
						<span class="actions">
							<button class="btn sec" disabled={busy !== ''} onclick={() => retry(f)}
								>Try again</button
							>
							<button class="btn sec" disabled={busy !== ''} onclick={() => discard(f)}
								>Discard</button
							>
						</span>
					</li>{/each}
			</ul>
		{/if}
		{#if status}<p class="s13" role="status">{status}</p>{/if}
	</div>{/if}

<style>
	.failed {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.failed li {
		display: grid;
		gap: 4px;
		padding: 10px 0;
		border-top: 1px solid currentColor;
		border-top-color: color-mix(in srgb, currentColor 20%, transparent);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}
</style>
