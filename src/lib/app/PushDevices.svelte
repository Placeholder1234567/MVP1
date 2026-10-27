<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
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
	let listRequest: AbortController | undefined;
	let listGeneration = 0;
	let online = $state(false);
	let visible = $state(false);
	const identity = () =>
		JSON.stringify([app.user.agencyId, app.user.profileId, app.user.role, app.user.features]);
	let previousIdentity = '';
	function interruptList(clear = false) {
		listGeneration++;
		listRequest?.abort();
		if (clear) {
			devices = [];
			loaded = false;
		}
	}
	$effect(() => {
		const next = identity();
		if (next !== previousIdentity) {
			previousIdentity = next;
			interruptList(true);
		}
		if (app.privacyLocked) interruptList(true);
	});
	beforeNavigate(() => interruptList(true));
	onDestroy(() => interruptList(true));
	let loadingList = $state(false);
	async function load() {
		if (!online || !visible || app.privacyLocked || busy) return;
		interruptList();
		const request = new AbortController();
		listRequest = request;
		const generation = listGeneration,
			account = identity();
		const valid = () =>
			generation === listGeneration &&
			account === identity() &&
			!request.signal.aborted &&
			!app.privacyLocked &&
			online &&
			visible;
		loadingList = true;
		try {
			const rows = await trpc.notification.pushDevices.query(undefined, { signal: request.signal });
			if (valid()) {
				devices = rows;
				loaded = true;
			}
		} finally {
			if (listRequest === request) loadingList = false;
		}
	}
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
			visible = document.visibilityState === 'visible';
			if (!online || !visible) {
				interruptList();
				loadingList = false;
			}
		};
		update();
		void load().catch(() => {});
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		document.addEventListener('visibilitychange', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
			document.removeEventListener('visibilitychange', update);
		};
	});
	async function remove(id: string) {
		if (busy || loadingList || !online || !visible || app.privacyLocked) return;
		if (
			!confirm(
				'Stop Guad push delivery to this device? Its saved notes and in-app alerts are unchanged.'
			)
		)
			return;
		interruptList();
		// Captured before the request: a lock, navigation or another sign-in while it
		// runs must not let this removal touch the newer view or profile's push.
		const generation = listGeneration,
			account = identity(),
			profileId = app.user.profileId;
		const sameAccount = () => account === identity();
		const sameView = () => sameAccount() && generation === listGeneration && !app.privacyLocked;
		busy = true;
		message = '';
		try {
			await trpc.notification.removePushDevice.mutate({ id });
			// Finish this device's cleanup only for the account that asked for it.
			// This keeps going after navigation or a lock: the person asked to stop
			// delivery to this device. Only another sign-in stops it.
			if (sameAccount()) {
				const local = await readPushRegistration();
				if (sameAccount() && local?.id === id && local.profileId === profileId)
					await stopWebPush(profileId);
			}
			if (!sameView()) return;
			devices = devices.filter((device) => device.id !== id);
			message = 'Push device removed. A delivery already in progress may still arrive.';
		} catch {
			if (sameView()) message = 'Could not remove this push device. Reconnect and try again.';
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
	{#if !app.privacyLocked}
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
				<button
					class="btn sec"
					disabled={busy || loadingList || !online || !visible || app.privacyLocked}
					onclick={() => remove(device.id)}>Remove device {index + 1}</button
				>
			</div>{/each}
	{/if}
	{#if !app.privacyLocked && loaded && !devices.length}<p>
			No push devices are registered for your account.
		</p>{/if}
	<button
		class="textbtn"
		disabled={busy || loadingList || !online || !visible || app.privacyLocked}
		onclick={() => load().catch(() => {})}
		>{loadingList ? 'Loading…' : 'Refresh push devices'}</button
	>
	{#if message}<p role="status">{message}</p>{/if}
</section>
