<script lang="ts">
	import { onMount } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import { useSession } from './session.svelte';
	import {
		pushAvailable,
		pushConfigured,
		webPushController,
		stopWebPush,
		PUSH_DISABLED
	} from '#lib/pwa/web-push.ts';
	import { readPushRegistration, pushEnabled } from '#lib/pwa/push-storage.ts';
	import type { PushStatus } from '#lib/pwa/push-controller.ts';
	const app = useSession();
	let status = $state<PushStatus>('off');
	let loaded = $state(false);
	let configured = $state(false);
	let controller: ReturnType<typeof webPushController> | undefined;
	const labels: Record<PushStatus, string> = {
		'not-configured': 'Browser push is not configured. Your in-app alerts remain available.',
		unsupported:
			'Browser push is unavailable here. Try your agency’s supported browser. On iPhone or iPad, install Guad on the Home Screen first.',
		denied:
			'Browser permission is blocked. Change notification permission in browser settings, then reload this page.',
		off: 'Push is off in this browser. Enabling a delivery preference alone does not register this device.',
		working: 'Preparing this browser’s push registration…',
		registered:
			'This browser has a push registration. Delivery still depends on permission, connectivity and agency setup; use Refresh to renew it.',
		failed:
			'Push setup did not finish. Reconnect and try again. If an app update is waiting, save your work, close all Guad windows and reopen.'
	};
	onMount(() => {
		const disabled = (event: Event) => {
			if ((event as CustomEvent<string>).detail === app.user.profileId) status = 'off';
		};
		window.addEventListener(PUSH_DISABLED, disabled);
		void (async () => {
			if (!pushConfigured()) {
				status = 'not-configured';
				loaded = true;
				return;
			}
			if (!pushAvailable()) {
				status = 'unsupported';
				loaded = true;
				return;
			}
			try {
				configured = (await trpc.notification.pushConfiguration.query()).enabled;
				if (!configured) {
					status = 'not-configured';
					return;
				}
				controller = webPushController(app.user.profileId, true);
				const registration = await readPushRegistration();
				status =
					Notification.permission === 'denied'
						? 'denied'
						: registration?.profileId === app.user.profileId && (await pushEnabled())
							? 'registered'
							: 'off';
			} catch {
				status = 'failed';
			} finally {
				loaded = true;
			}
		})();
		return () => window.removeEventListener(PUSH_DISABLED, disabled);
	});
	async function enable() {
		if (!controller) return;
		status = 'working';
		status = await controller.enable();
	}
	async function disable() {
		status = 'working';
		status = (await stopWebPush(app.user.profileId)) ? 'off' : 'failed';
		controller = webPushController(app.user.profileId, configured);
	}
</script>

<section class="card pad stack" aria-label="Browser push setup">
	<h2>Push in this browser</h2>
	<p class="muted">
		Optional browser push uses Firebase to store non-clinical installation and delivery metadata on
		this device. Your sign-in credentials stay in memory and care records remain encrypted.
		Lock-screen messages contain generic text only.
	</p>
	<p role="status">{loaded ? labels[status] : 'Checking browser push configuration…'}</p>
	{#if loaded && configured && status !== 'unsupported'}<div class="actions">
			<button
				class="btn sec"
				disabled={status === 'working' || status === 'denied'}
				onclick={enable}
				>{status === 'registered' ? 'Refresh push registration' : 'Enable browser push'}</button
			><button class="textbtn" disabled={status === 'working'} onclick={disable}
				>Turn off push in this browser</button
			>
		</div>{/if}
</section>
