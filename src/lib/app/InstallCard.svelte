<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	let ready = $state(false);
	let waiting = $state(false);
	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.getRegistration().then((registration) => {
			ready = !!registration?.active;
			waiting = !!registration?.waiting;
		});
	});
</script>

<section class="card pad stack">
	<h2>Guad, within reach.</h2>
	<p class="muted">
		Install Guad from your browser’s menu or use Add to Home Screen on your phone. Open it online
		first and let your records finish syncing.
	</p>
	<p role="status">
		{ready
			? 'Offline app files are ready on this device.'
			: 'Open Guad online to finish preparing offline app files.'}
	</p>
	{#if waiting}<p class="callout">
			An app update is ready. Save your notes, then close all Guad windows and reopen to update.
		</p>{/if}<a class="btn sec" href={resolve('/offline')} data-sveltekit-reload
		>Open saved workspace</a
	>
	<p class="muted">
		Your device PIN protects saved records. Reconnect and sign in at least every 12 hours to refresh
		saved access.
	</p>
</section>
