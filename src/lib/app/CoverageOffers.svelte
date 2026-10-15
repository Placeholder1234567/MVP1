<script lang="ts">
	import { onMount } from 'svelte';
	import { useSession } from './session.svelte';
	import { trpc } from '#lib/trpc.ts';
	const app = useSession();
	let offers = $state<Awaited<ReturnType<typeof trpc.coverage.offers.query>>>([]);
	let busy = $state(false);
	let message = $state('');
	async function refresh() {
		try {
			offers = await trpc.coverage.offers.query();
		} catch {
			/* Saved care records remain usable offline. */
		}
	}
	onMount(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), 30000);
		return () => clearInterval(timer);
	});
	async function reply(id: string, accept: boolean) {
		busy = true;
		message = '';
		try {
			if (accept) await trpc.coverage.accept.mutate({ id });
			else await trpc.coverage.decline.mutate({ id });
			message = accept ? 'You’ve picked up the shift. Thank you.' : 'Your reply is saved.';
			await refresh();
		} catch {
			message =
				'Could not record your reply. Reconnect and refresh; another staff member may have accepted first.';
		} finally {
			busy = false;
		}
	}
</script>

{#if offers.length || message}<section class="stack" aria-label="Shift offers">
		{#each offers as offer (offer.id)}<div class="callout warn stack">
				<div>
					<b>Can you pick up a shift?</b>
					<p>
						{app.homes.find((h) => h.id === offer.homeId)?.name ?? 'Your home'} · {offer.day} · {offer.shift.toUpperCase()}
					</p>
				</div>
				<div class="actions">
					<button class="btn" disabled={busy} onclick={() => reply(offer.id, true)}
						>I’ll take it</button
					><button class="textbtn" disabled={busy} onclick={() => reply(offer.id, false)}
						>Not this time</button
					>
				</div>
			</div>{/each}{#if message}<p role="status">{message}</p>{/if}
	</section>{/if}
