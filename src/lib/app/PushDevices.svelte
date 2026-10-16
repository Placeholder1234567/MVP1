<script lang="ts">
	import { onMount } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import { useSession } from './session.svelte';
	import { readPushRegistration } from '#lib/pwa/push-storage.ts';
	import { stopWebPush } from '#lib/pwa/web-push.ts';
	const app = useSession();
	let devices = $state<
		Array<{ id: string; platform: string | null; lastSeenAt: Date | null; createdAt: Date }>
	>([]);
	let busy = $state(false);
	let loaded = $state(false);
	let message = $state('');
	async function load() {
		busy = true;
		message = '';
		try {
			devices = await trpc.notification.pushDevices.query();
			loaded = true;
		} catch {
			message = 'Connect to load your push devices.';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void load();
	});
	async function remove(id: string) {
		if (
			!confirm(
				'Stop Guad push delivery to this device? Its saved notes and in-app alerts are unchanged.'
			)
		)
			return;
		busy = true;
		message = '';
		try {
			await trpc.notification.removePushDevice.mutate({ id });
			const local = await readPushRegistration();
			if (local?.id === id && local.profileId === app.user.profileId)
				await stopWebPush(app.user.profileId);
			devices = devices.filter((device) => device.id !== id);
			message = 'Push device removed. A delivery already in progress may still arrive.';
		} catch {
			message = 'Could not remove this push device. Reconnect and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="card pad stack" aria-label="Push devices">
	<h2>Your push devices</h2>
	<p class="muted">
		Remove registrations you no longer use. This list belongs only to your account. Device tokens
		are never displayed.
	</p>
	<p class="muted">
		Use the browser push setup above to register this browser when your agency has configured it.
		Enabling a delivery preference alone does not register a device or grant browser permission.
	</p>
	{#each devices as device, index (device.id)}<div class="spread">
			<div>
				<b
					>{device.platform === 'web'
						? 'Browser'
						: device.platform === 'ios'
							? 'iPhone or iPad'
							: device.platform === 'android'
								? 'Android'
								: 'Push device'}
					{index + 1}</b
				>
				<p class="muted">
					Last registered: {device.lastSeenAt
						? new Date(device.lastSeenAt).toLocaleDateString()
						: new Date(device.createdAt).toLocaleDateString()}
				</p>
			</div>
			<button class="btn sec" disabled={busy} onclick={() => remove(device.id)}
				>Remove device {index + 1}</button
			>
		</div>{/each}
	{#if loaded && !devices.length}<p>No push devices are registered for your account.</p>{/if}
	<button class="textbtn" disabled={busy} onclick={load}
		>{busy ? 'Loading…' : 'Refresh push devices'}</button
	>
	{#if message}<p role="status">{message}</p>{/if}
</section>
