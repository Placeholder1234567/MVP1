<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		inspectDevice,
		requestPersistence,
		deviceIssue,
		storageReady,
		type DeviceReadiness
	} from '#lib/pwa/readiness.ts';
	let { showWorkspace = true }: { showWorkspace?: boolean } = $props();
	let ready = $state(false);
	let waiting = $state(false);
	let device = $state<DeviceReadiness | null>(null);
	let checking = $state(true);
	let requesting = $state(false);
	let registrationFailed = $state(false);
	async function check() {
		checking = true;
		device = await inspectDevice();
		checking = false;
		if (!device.serviceWorker) return;
		try {
			const registration = await navigator.serviceWorker.getRegistration();
			ready = !!registration?.active;
			waiting = !!registration?.waiting;
			registrationFailed = false;
		} catch {
			registrationFailed = true;
		}
	}
	onMount(() => {
		void check();
	});
</script>

<section class="card pad stack">
	<h2>Guad, within reach.</h2>
	<p class="muted">
		Open Guad online first and let your records finish syncing. Installing the app does not itself
		prepare saved records or guarantee they will remain on this device.
	</p>
	<details>
		<summary>How to install</summary>
		<div class="stack">
			<p>
				On iPhone or iPad, open Guad in Safari, choose Share, then Add to Home Screen. Open the new
				icon online and sign in there; saved records from another browser may not be available.
			</p>
			<p>
				On Android or a computer, open your browser’s menu and look for Install app or Add to Home
				screen. If it is absent, use Guad in the browser or ask your agency which browser to use.
			</p>
		</div>
	</details>
	{#if checking}<p role="status">Checking this browser’s device storage…</p>
	{:else if device}
		{#if deviceIssue(device)}<p class="callout warn" role="status">{deviceIssue(device)}</p>
		{:else}<p>
				Encryption and private storage checks passed. Opening your saved workspace still requires a
				valid PIN and a working encrypted database.
			</p>{/if}
		{#if !device.serviceWorker}<p class="callout warn">
				This browser cannot prepare offline app files. Use a supported browser and reconnect before
				relying on saved access.
			</p>{/if}
		<p role="status">
			{device.persistence === 'granted'
				? 'The browser has granted persistent storage.'
				: device.persistence === 'not-granted'
					? 'Storage is not persistent. The browser may remove saved data when space is low.'
					: device.persistence === 'unavailable'
						? 'The browser could not check storage persistence.'
						: 'This browser does not provide storage persistence controls.'}
		</p>
		{#if storageReady(device) && device.persistence !== 'granted' && typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function'}
			<button
				class="btn sec"
				disabled={requesting}
				onclick={async () => {
					requesting = true;
					const persistence = await requestPersistence();
					if (device) device = { ...device, persistence };
					requesting = false;
				}}>{requesting ? 'Asking the browser…' : 'Ask browser to keep saved data'}</button
			>
		{/if}
		<p class="muted">
			Persistent storage reduces automatic removal; it is not a backup. Browser settings, private
			browsing, signing out or clearing site data can still remove records. Keep changes synced.
		</p>
	{/if}
	<p role="status">
		{registrationFailed
			? 'The browser could not check offline app files. Reconnect and try checking again.'
			: ready
				? 'Offline app files are ready on this device.'
				: 'Open Guad online to finish preparing offline app files.'}
	</p>
	{#if waiting}<p class="callout">
			An app update is ready. Save your notes, then close all Guad windows and reopen to update.
		</p>{/if}{#if showWorkspace && device && storageReady(device)}<a
			class="btn sec"
			href={resolve('/offline')}
			data-sveltekit-reload>Open saved workspace</a
		>{/if}
	<button class="textbtn" disabled={checking} onclick={check}>Check this browser again</button>
	<p class="muted">
		Your device PIN protects saved records. Reconnect and sign in at least every 12 hours to refresh
		saved access.
	</p>
</section>
