<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import {
		channelsFor,
		requiredChannels,
		NOTIFICATION_TYPES,
		NOTIFICATION_LABELS,
		MANDATORY,
		type NotificationType,
		type Preference,
		type Channel
	} from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';
	import QuietHoursSettings from '#lib/app/QuietHoursSettings.svelte';
	import PushDevices from '#lib/app/PushDevices.svelte';
	import WebPushSettings from '#lib/app/WebPushSettings.svelte';
	const app = useSession();
	let edits = $state<Partial<Record<NotificationType, Partial<Preference>>>>({});
	let savedChanges = $state<Partial<Record<NotificationType, Partial<Preference>>>>({});
	let busy = $state(false);
	let message = $state('');
	const changed = $derived(Object.keys(edits).length);
	const channels: Channel[] = ['push', 'sms', 'email'];
	function selected(type: NotificationType, channel: Channel) {
		if (requiredChannels(type, app.user.role).includes(channel)) return true;
		if (edits[type]?.[channel] !== undefined) return edits[type]![channel];
		if (savedChanges[type]?.[channel] !== undefined) return savedChanges[type]![channel];
		return synced(type, channel);
	}
	function synced(type: NotificationType, channel: Channel) {
		const saved = app.notificationPreferences.find((p) => p.notification_type === type);
		return channelsFor(
			type,
			app.user.role,
			saved
				? { push: !!saved.push_enabled, sms: !!saved.sms_enabled, email: !!saved.email_enabled }
				: undefined
		).includes(channel);
	}
	$effect(() => {
		const pending = NOTIFICATION_TYPES.filter((type) => savedChanges[type]);
		const remaining = pending.filter((type) =>
			channels.some(
				(channel) =>
					savedChanges[type]?.[channel] !== undefined &&
					savedChanges[type]![channel] !== synced(type, channel)
			)
		);
		if (remaining.length !== pending.length)
			savedChanges = Object.fromEntries(remaining.map((type) => [type, savedChanges[type]]));
	});
	let online = $state(false);
	let visible = $state(false);
	let generation = 0;
	let controller: AbortController | undefined;
	const canConnect = $derived(online && visible && !app.privacyLocked);
	const identity = () =>
		JSON.stringify([app.user.agencyId, app.user.profileId, app.user.role, app.user.features]);
	let previousIdentity = '';
	function interrupt() {
		generation++;
		controller?.abort();
		busy = false;
		message = '';
	}
	$effect(() => {
		const next = identity();
		if (next !== previousIdentity) {
			previousIdentity = next;
			interrupt();
			edits = {};
			savedChanges = {};
		}
		if (app.privacyLocked) interrupt();
	});
	onDestroy(interrupt);
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
			visible = document.visibilityState === 'visible';
			if (!online || !visible) interrupt();
		};
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		document.addEventListener('visibilitychange', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
			document.removeEventListener('visibilitychange', update);
		};
	});
	beforeNavigate(({ cancel }) => {
		if (changed && !confirm('Leave without saving your delivery preferences?')) {
			cancel();
			return;
		}
		interrupt();
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!canConnect || busy || !changed) return;
		interrupt();
		const current = generation,
			account = identity();
		const request = new AbortController();
		controller = request;
		const valid = () =>
			current === generation && account === identity() && canConnect && !request.signal.aborted;
		const submitted = $state.snapshot(edits);
		busy = true;
		message = '';
		try {
			await trpc.notification.updatePreferences.mutate(
				{
					preferences: NOTIFICATION_TYPES.filter((type) => submitted[type]).map((type) => ({
						notificationType: type,
						pushEnabled: submitted[type]?.push,
						smsEnabled: submitted[type]?.sms,
						emailEnabled: submitted[type]?.email
					}))
				},
				{ signal: request.signal }
			);
			if (!valid()) return;
			const pending = { ...savedChanges };
			for (const type of NOTIFICATION_TYPES)
				if (submitted[type]) pending[type] = { ...pending[type], ...submitted[type] };
			savedChanges = pending;
			edits = {};
			message = 'Delivery preferences saved. Required safety channels remain enabled.';
		} catch {
			if (valid()) message = 'Connect to save your preferences. Your selections are still here.';
		} finally {
			if (valid()) busy = false;
		}
	}
</script>

<svelte:head><title>Delivery preferences · Guad</title></svelte:head>
<svelte:window
	onbeforeunload={(event) => {
		if (changed) event.preventDefault();
	}}
/>
{#if !app.privacyLocked}
	<form aria-label="Delivery preferences" class="stack" onsubmit={save}>
		<a class="textbtn" href={resolve('/(app)/notifications')}>← Your alerts</a>
		<p class="eyebrow">Make it yours</p>
		<h1>The updates you need.</h1>
		<p class="muted">
			Choose delivery channels for alerts addressed to you. Alerts always appear in the app.
			Required safety channels stay on. Push and SMS delivery depend on agency setup and device
			permission.
		</p>
		<div class="callout">
			Interrupted saves may still complete; check your preferences before retrying. Connect to save
			changes. High-priority alerts bypass quiet hours; normal push and SMS alerts follow your quiet
			hours.
		</div>
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		<div class="actions">
			<button class="btn" disabled={busy || !changed || !canConnect}
				>Save preferences{changed ? ` (${changed})` : ''}</button
			>{#if changed}<button
					type="button"
					class="textbtn"
					disabled={busy}
					onclick={() => (edits = {})}>Discard changes</button
				>{/if}
		</div>
		<div class="grid">
			{#each NOTIFICATION_TYPES as type (type)}<fieldset
					class="card pad stack"
					disabled={busy || !canConnect}
				>
					<legend class="sr">{NOTIFICATION_LABELS[type]}</legend>
					<div class="spread">
						<h2>{NOTIFICATION_LABELS[type]}</h2>
						{#if MANDATORY.has(type)}<span class="pill">Safety alert</span>{/if}
					</div>
					<div class="channel-options">
						{#each channels as channel (channel)}{@const required = requiredChannels(
								type,
								app.user.role
							).includes(channel)}<label
								><input
									type="checkbox"
									aria-label={`${NOTIFICATION_LABELS[type]} ${channel}`}
									checked={selected(type, channel)}
									disabled={required}
									onchange={(event) => {
										edits[type] = { ...edits[type], [channel]: event.currentTarget.checked };
									}}
								/><span
									>{channel === 'sms'
										? 'SMS'
										: channel === 'push'
											? 'Push'
											: 'Email'}{#if required}<small>Required</small>{/if}</span
								></label
							>{/each}
					</div>
				</fieldset>{/each}
		</div>
		<button class="btn" disabled={busy || !changed || !canConnect}>Save preferences</button>
	</form>
{/if}
<div class="stack"><QuietHoursSettings /><WebPushSettings /><PushDevices /></div>

<style>
	fieldset {
		min-width: 0;
		margin: 0;
	}
	h2 {
		font-size: 17px;
	}
	.channel-options {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.channel-options label {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		flex: 1;
	}
	input {
		width: 20px;
		height: 20px;
		accent-color: var(--blue);
	}
	small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
</style>
