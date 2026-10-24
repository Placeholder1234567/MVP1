<script lang="ts">
	// Messaging usage (notifications.md "Cost Tracking", "Opt-Out"): what went
	// out this month and roughly what the texts cost, and whose saved text preferences are off.
	import { onMount } from 'svelte';
	import { trpc } from '#lib/trpc.ts';

	type Usage = Awaited<ReturnType<typeof trpc.agency.messagingUsage.query>>;
	let usage = $state<Usage | null>(null);
	let message = $state('');

	onMount(async () => {
		try {
			usage = await trpc.agency.messagingUsage.query();
		} catch {
			message = 'Connect to see messaging usage.';
		}
	});
	const monthName = (day: string) =>
		new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
</script>

<section class="card pad stack" aria-labelledby="messaging-usage-heading">
	<h2 id="messaging-usage-heading">Messaging usage</h2>
	{#if usage}
		<p class="muted">Sent in {monthName(usage.month)}.</p>
		<dl class="usage">
			<div>
				<dt>Texts</dt>
				<dd>{usage.texts} <span class="muted s13">· about {usage.textCost}</span></dd>
			</div>
			<div>
				<dt>Emails</dt>
				<dd>{usage.emails}</dd>
			</div>
			<div>
				<dt>Push alerts</dt>
				<dd>{usage.pushes}</dd>
			</div>
		</dl>
		<p class="muted s13">
			The text cost is an estimate at about a cent per text; your bill may differ.
		</p>
		<h3>Saved text preferences off</h3>
		<p class="muted s13">
			This list reflects saved preferences, not carrier consent or delivery status. A carrier STOP
			remains in effect even if settings enable texts; only a verified START reply clears it.
		</p>
		{#if usage.textsOff.length}
			<p class="muted s13">
				These staff have texts off for every notification type in their saved preferences. They can
				change preferences in their settings. Carrier restrictions still apply.
			</p>
			<ul>
				{#each usage.textsOff as p (p.id)}<li>{p.name}</li>{/each}
			</ul>
		{:else}<p class="muted">
				No staff with default text alerts have every saved text preference turned off.
			</p>{/if}
	{:else if message}<p class="muted" role="status">{message}</p>{:else}<p class="muted">
			Loading…
		</p>{/if}
</section>

<style>
	.usage {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 12px;
		margin: 0;
	}
	.usage dt {
		font-size: 13px;
		color: var(--muted);
	}
	.usage dd {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}
</style>
