<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		NOTIFICATION_TYPES,
		NOTIFICATION_LABELS,
		type NotificationType
	} from '#lib/domain/index.ts';
	import { devNotifications } from '#lib/app/dev-notification-client.ts';
	let selected = $state<NotificationType>('health_alert');
	let previews = $state<Awaited<ReturnType<typeof devNotifications.preview.mutate>>>([]);
	let recent = $state<Awaited<ReturnType<typeof devNotifications.recent.query>>>([]);
	let busy = $state(false);
	let message = $state('');
	let failure = $state('');
	let historyScope = $state<'mine' | 'agency'>('mine');
	let tasks = $state<Awaited<ReturnType<typeof devNotifications.pendingTasks.query>>>([]);
	onMount(() => {
		void refresh();
	});
	async function refresh() {
		try {
			recent = await devNotifications.recent.query({ scope: historyScope });
			tasks = await devNotifications.pendingTasks.query();
		} catch {
			failure = 'Could not load delivery history.';
		}
	}
	async function fireTask(id: string) {
		if (
			busy ||
			!confirm('Run this synthetic notification escalation now in the local demo agency?')
		)
			return;
		busy = true;
		failure = '';
		try {
			const result = await devNotifications.fireTask.mutate({ id, confirm: true });
			message = `Task handler: ${result.outcome}. Check delivery history for the result.`;
			await refresh();
		} catch {
			failure = 'Could not run the task. It may have already run or expired.';
		} finally {
			busy = false;
		}
	}
	async function sendTest() {
		if (
			busy ||
			!confirm(
				'Queue a synthetic test for your account? Normal delivery and escalation rules will run in this local demo agency.'
			)
		)
			return;
		busy = true;
		failure = '';
		message = '';
		try {
			const result = await devNotifications.sendTest.mutate({ type: selected, confirm: true });
			message = `Synthetic test requested: ${result.deliveriesQueued} deliveries queued. Delivery is not yet confirmed.`;
			await refresh();
		} catch {
			failure = 'Could not request the synthetic test.';
		} finally {
			busy = false;
		}
	}
	async function preview(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		failure = '';
		message = '';
		previews = [];
		try {
			previews = await devNotifications.preview.mutate({ type: selected });
			message = previews.length
				? 'Preview prepared. Nothing was queued or sent.'
				: 'No delivery channels selected by the current preferences and agency rules.';
		} catch {
			failure = 'Could not prepare the preview.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Development notifications · Guad</title></svelte:head>
<main class="panel stack">
	<a href={resolve('/(app)/dashboard/setup')}>← Setup</a>
	<h1>Development notifications</h1>
	<p>
		Template previews use synthetic text and your current preferences and agency policy. Preview
		links are temporary and are not saved notifications.
	</p>
	<form class="card pad stack" aria-label="Synthetic notification preview" onsubmit={preview}>
		<label for="notification-type">Notification type</label>
		<select id="notification-type" class="input" bind:value={selected} disabled={busy}
			>{#each NOTIFICATION_TYPES as type (type)}<option value={type}
					>{NOTIFICATION_LABELS[type]}</option
				>{/each}</select
		>
		<button class="btn" disabled={busy}>Preview notification</button>
		<button type="button" class="btn sec" disabled={busy} onclick={sendTest}
			>Send synthetic test</button
		>
		{#if message}<p role="status">{message}</p>{/if}
		{#if failure}<p role="alert">{failure}</p>{/if}
	</form>
	{#each previews as item (item.delivery.notificationId)}
		<section class="card pad stack" aria-label={`${item.channel} preview`}>
			<h2>{item.channel} preview</h2>
			<b>{item.delivery.title}</b>
			<p class="copy">{item.delivery.body}</p>
			<p class="muted">Temporary link: <span class="copy">{item.delivery.link}</span></p>
		</section>
	{/each}
	<section class="stack" aria-labelledby="recent-heading">
		<div class="spread">
			<h2 id="recent-heading">Recent deliveries</h2>
			<button class="btn sec" onclick={refresh}>Refresh history</button>
		</div>
		<label for="history-scope">Delivery history scope</label>
		<select id="history-scope" class="input" bind:value={historyScope} onchange={refresh}>
			<option value="mine">My account</option><option value="agency">Demo agency</option>
		</select>
		<p class="muted">Latest 50 notifications for the selected scope.</p>
		{#each recent as item (item.id)}<article class="card pad stack">
				<b>{item.title}</b><span
					>{item.profileName} · {item.type} · {item.channel} · {item.status}</span
				>
				<p class="copy">{item.body ?? ''}</p>
			</article>{:else}<p>No delivery history.</p>{/each}
	</section>
	<section class="stack" aria-labelledby="tasks-heading">
		<h2 id="tasks-heading">Pending synthetic escalations</h2>
		<p class="muted">
			Only synthetic notification tests for this demo agency appear here (up to 100). Local timers
			disappear when the server restarts; request a new test then.
		</p>
		{#each tasks as task (task.id)}
			<article class="card pad stack">
				<p>{task.type} · Step {task.step} · {task.scheduledAt.toLocaleString()}</p>
				<button class="btn sec" disabled={busy} onclick={() => fireTask(task.id)}
					>Run synthetic escalation now</button
				>
			</article>
		{:else}<p>No pending synthetic escalations.</p>{/each}
	</section>
</main>

<style>
	.panel {
		max-width: 900px;
		margin: 0 auto;
		padding: 24px;
	}
	.copy {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
