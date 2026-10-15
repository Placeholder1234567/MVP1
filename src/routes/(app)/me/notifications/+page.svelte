<script lang="ts">
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
	beforeNavigate(({ cancel }) => {
		if (changed && !confirm('Leave without saving your delivery preferences?')) cancel();
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			await trpc.notification.updatePreferences.mutate({
				preferences: NOTIFICATION_TYPES.filter((type) => edits[type]).map((type) => ({
					notificationType: type,
					pushEnabled: edits[type]?.push,
					smsEnabled: edits[type]?.sms,
					emailEnabled: edits[type]?.email
				}))
			});
			const pending = { ...savedChanges };
			for (const type of NOTIFICATION_TYPES)
				if (edits[type]) pending[type] = { ...pending[type], ...edits[type] };
			savedChanges = pending;
			edits = {};
			message = 'Delivery preferences saved. Required safety channels remain enabled.';
		} catch {
			message = 'Connect to save your preferences. Your selections are still here.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Delivery preferences · Guad</title></svelte:head>
<svelte:window
	onbeforeunload={(event) => {
		if (changed) event.preventDefault();
	}}
/>
<form class="stack" onsubmit={save}>
	<a class="textbtn" href={resolve('/(app)/notifications')}>← Your alerts</a>
	<p class="eyebrow">Make it yours</p>
	<h1>The updates you need.</h1>
	<p class="muted">
		Choose delivery channels for alerts addressed to you. Alerts always appear in the app. Required
		safety channels stay on. Push and SMS delivery depend on agency setup and device permission.
	</p>
	<div class="callout">
		Connect to save changes. High-priority alerts bypass quiet hours; normal push and SMS alerts
		follow your quiet hours.
	</div>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	<div class="actions">
		<button class="btn" disabled={busy || !changed}
			>Save preferences{changed ? ` (${changed})` : ''}</button
		>{#if changed}<button type="button" class="textbtn" disabled={busy} onclick={() => (edits = {})}
				>Discard changes</button
			>{/if}
	</div>
	<div class="grid">
		{#each NOTIFICATION_TYPES as type (type)}<fieldset class="card pad stack" disabled={busy}>
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
	<button class="btn" disabled={busy || !changed}>Save preferences</button>
</form>

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
