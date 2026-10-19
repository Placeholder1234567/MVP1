<script lang="ts">
	// The upgrade dialog (entitlements.md §9): shown when someone reaches a
	// feature their agency's plan doesn't include. No self-service plan
	// changes in v1, so admins are pointed to support and everyone else to
	// their admin.
	import { SUPPORT_EMAIL, upgradeMessage } from '#lib/entitlements/upgrade.ts';
	import { upgrade } from './upgrade.svelte.ts';

	let { isAdmin }: { isAdmin: boolean } = $props();
	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (upgrade.feature && dialog && !dialog.open) dialog.showModal();
	});
</script>

<dialog
	bind:this={dialog}
	class="card pad stack upgrade"
	aria-labelledby="upgrade-title"
	onclose={() => (upgrade.feature = null)}
>
	<h2 id="upgrade-title">Not on your plan</h2>
	{#if upgrade.feature}<p>{upgradeMessage(upgrade.feature)}</p>{/if}
	{#if isAdmin}
		<p class="muted">Plan changes go through Guad support.</p>
		<a class="btn sec" href="mailto:{SUPPORT_EMAIL}?subject=Subscription%20upgrade"
			>Contact support</a
		>
	{:else}
		<p class="muted">Ask your administrator about upgrading your agency's plan.</p>
	{/if}
	<form method="dialog"><button class="btn">Close</button></form>
</dialog>

<style>
	.upgrade {
		max-width: min(420px, calc(100vw - 32px));
		border: 0;
	}
	/* .card/.stack set display, which would override the closed dialog's hiding. */
	.upgrade:not([open]) {
		display: none;
	}
	.upgrade::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
</style>
