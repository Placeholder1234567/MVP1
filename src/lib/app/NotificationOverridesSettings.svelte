<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import {
		notificationOverrides,
		AGENCY_REQUIRED_NOTIFICATIONS,
		NOTIFICATION_TYPES,
		NOTIFICATION_LABELS,
		DEFAULT_QUIET_HOURS,
		type NotificationType
	} from '#lib/domain/index.ts';
	let { settings, onSaved }: { settings: unknown; onSaved?: () => void } = $props();
	const initial = notificationOverrides(untrack(() => settings));
	let disabled = $state<NotificationType[]>([...initial.disabledTypes]);
	let forceSms = $state<NotificationType[]>([...initial.forceSmsTypes]);
	let requireEmail = $state(initial.requireSummaryEmail);
	let agencyQuiet = $state(!!initial.quietHours);
	let start = $state(initial.quietHours?.start ?? DEFAULT_QUIET_HOURS.start);
	let end = $state(initial.quietHours?.end ?? DEFAULT_QUIET_HOURS.end);
	let saving = $state(false);
	let error = $state('');
	let message = $state('');
	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = '';
		message = '';
		try {
			await trpc.agency.update.mutate({
				settings: {
					notification_overrides: {
						disabledTypes: disabled,
						forceSmsTypes: forceSms,
						requireSummaryEmail: requireEmail,
						quietHours: agencyQuiet ? { start, end } : null
					}
				}
			});
			message = 'Notification rules saved.';
			onSaved?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save notification rules.';
		} finally {
			saving = false;
		}
	}
</script>

<form class="card pad stack" onsubmit={save} aria-labelledby="notification-rules-heading">
	<h2 id="notification-rules-heading">Agency notification rules</h2>
	<p class="muted">
		These rules take precedence over personal preferences. Safety and essential workflow alerts stay
		enabled.
	</p>
	<fieldset class="stack" disabled={saving}>
		<label class="check"
			><input type="checkbox" bind:checked={requireEmail} />Require daily summary email</label
		>
		<label class="check"
			><input type="checkbox" bind:checked={agencyQuiet} />Use agency-wide quiet hours</label
		>
		{#if agencyQuiet}
			<div class="grid2">
				<label
					>Agency quiet hours start<input
						class="input"
						type="time"
						required
						bind:value={start}
					/></label
				>
				<label
					>Agency quiet hours end<input
						class="input"
						type="time"
						required
						bind:value={end}
					/></label
				>
			</div>
			<p class="muted">
				Choose 4–10 hours in the agency’s time zone. Urgent and high-priority alerts still arrive
				immediately; email is unaffected.
			</p>
		{/if}
		<fieldset class="stack">
			<legend>Disable optional notification types</legend>
			{#each NOTIFICATION_TYPES.filter((t) => !AGENCY_REQUIRED_NOTIFICATIONS.has(t)) as type (type)}
				<label class="check"
					><input type="checkbox" value={type} bind:group={disabled} />{NOTIFICATION_LABELS[
						type
					]}</label
				>
			{/each}
		</fieldset>
		<fieldset class="stack">
			<legend>Require supervisor SMS</legend>
			<p class="muted">
				Selected alerts use SMS for supervisors who have verified their number by texting START.
				Carrier STOP and legacy opt-outs remain protected. Missing consent or a phone number means
				SMS cannot be required; push and email keep their existing rules.
			</p>
			{#each NOTIFICATION_TYPES as type (type)}
				<label class="check"
					><input type="checkbox" value={type} bind:group={forceSms} />Require SMS: {NOTIFICATION_LABELS[
						type
					]}</label
				>
			{/each}
		</fieldset>
		{#if error}<p role="alert" class="callout bad">{error}</p>{/if}
		{#if message}<p role="status" class="callout">{message}</p>{/if}
		<button class="btn">Save notification rules</button>
	</fieldset>
</form>
