<script lang="ts">
	// The push alerts ask (frontend-spec-2.md §8.6): a bottom sheet, not the
	// browser's bare prompt, once the person has used Guad on 3 days. "Turn
	// on" opens the browser's own permission prompt; "Not now" waits 30 days.
	// The days and the dismissal are kept on the device (device_flags).
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { useSession } from './session.svelte';
	import { trpc } from '#lib/trpc.ts';
	import { localTime, pushAskReasons, recordUseDay, shouldAskForPush } from '#lib/domain/index.ts';
	import { pushAvailable, pushConfigured, webPushController } from '#lib/pwa/web-push.ts';

	const app = useSession();
	let open = $state(false);
	let busy = $state(false);
	let blocked = $state(false);

	const flag = async (id: string) =>
		(
			await app.db?.getOptional<{ value: string }>('SELECT value FROM device_flags WHERE id = ?', [
				id
			])
		)?.value ?? null;
	const setFlag = (id: string, value: string) =>
		app.db?.execute('INSERT OR REPLACE INTO device_flags (id, value) VALUES (?, ?)', [id, value]);

	onMount(() => {
		void (async () => {
			try {
				const today = localTime(new Date(), app.user.timeZone).day;
				const days = recordUseDay(JSON.parse((await flag('use-days')) ?? '[]'), today);
				await setFlag('use-days', JSON.stringify(days));
				if (!pushConfigured() || !pushAvailable()) return;
				const ask = shouldAskForPush({
					days,
					dismissedAt: await flag('push-ask-dismissed'),
					now: new Date(),
					permission: Notification.permission
				});
				if (ask && (await trpc.notification.pushConfiguration.query()).enabled) open = true;
			} catch {
				// No ask is better than a broken one; Me → Notifications still works.
			}
		})();
	});

	async function turnOn() {
		busy = true;
		try {
			const status = await webPushController(app.user.profileId, true).enable();
			if (status === 'denied') blocked = true;
			else if (status === 'registered') open = false;
		} finally {
			busy = false;
		}
	}

	async function notNow() {
		open = false;
		await setFlag('push-ask-dismissed', new Date().toISOString())?.catch(() => {});
	}
</script>

{#if open}<div class="sheet card pad stack" role="dialog" aria-labelledby="push-ask-title">
		<span class="handle" aria-hidden="true"></span>
		<h2 id="push-ask-title">Stay updated on shifts</h2>
		{#if blocked}<p>
				Notifications are blocked. To turn them on, allow notifications for Guad in your browser
				settings, then come back.
			</p>
			<a class="textbtn" href={resolve('/(app)/me/notifications')}>Notification settings</a>
			<button class="btn sec" onclick={notNow}>Close</button>
		{:else}<p>Get notified when:</p>
			<ul>
				{#each pushAskReasons(app.user.role) as reason (reason)}<li>{reason}</li>{/each}
			</ul>
			<p class="muted s13">Alerts never show names or health details on your lock screen.</p>
			<button class="btn" disabled={busy} onclick={turnOn}
				>{busy ? 'Turning on…' : 'Turn on notifications'}</button
			>
			<button class="btn sec" disabled={busy} onclick={notNow}>Not now</button>{/if}
	</div>{/if}

<style>
	.sheet {
		position: fixed;
		left: 50%;
		bottom: calc(76px + env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		width: min(440px, calc(100vw - 32px));
		z-index: 30;
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4);
	}
	.handle {
		display: block;
		width: 40px;
		height: 4px;
		border-radius: 2px;
		background: var(--line2);
		margin: 0 auto;
	}
	h2 {
		margin: 0;
	}
	ul {
		margin: 0;
		padding-left: 20px;
	}
</style>
