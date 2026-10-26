<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	let { focusId }: { focusId?: string } = $props();
	const app = useSession();
	type Alert = Awaited<ReturnType<typeof trpc.notification.list.query>>[number];
	let history = $state<Alert[]>([]);
	let remoteFocus = $state<Alert | null>(null);
	const cachedFocus = $derived(app.notifications.find((n) => n.id === focusId));
	const focused = $derived(remoteFocus ?? (cachedFocus ? view(cachedFocus) : null));
	let offset = $state(0);
	let more = $state(true);
	let busy = $state(false);
	let unreadOnly = $state(false);
	let message = $state('');
	let readIds = $state<string[]>([]);
	const local = $derived(
		app.notifications
			.filter((n) => n.channel === 'in_app')
			.slice(0, 50)
			.map(view)
	);
	function view(n: (typeof app.notifications)[number]): Alert {
		return {
			id: n.id,
			type: n.type ?? '',
			title: n.title ?? 'Alert',
			body: n.body,
			channel: n.channel ?? 'in_app',
			status: n.status as Alert['status'],
			sentAt: n.sent_at ? new Date(n.sent_at) : null,
			readAt: n.read_at ? new Date(n.read_at) : null,
			referenceId: n.reference_id,
			referenceType: n.reference_type,
			createdAt: new Date(n.created_at ?? 0)
		};
	}
	const alerts = $derived(
		[...new Map([...history, ...local].map((n) => [n.id, n])).values()].sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime()
		)
	);
	const visible = $derived(
		alerts.filter((n) => !unreadOnly || (!n.readAt && !readIds.includes(n.id)))
	);
	const unread = $derived(alerts.filter((n) => !n.readAt && !readIds.includes(n.id)));
	/** A PRN follow-up opens the person's medications, where the effect is recorded. */
	function followupPerson(alert: Alert) {
		if (alert.type !== 'prn_followup') return null;
		return app.doses.find((d) => d.id === alert.referenceId)?.client_id ?? null;
	}
	function destination(type: string) {
		if (type.startsWith('coverage_') || type === 'shift_reminder') return '/(app)/shifts';
		if (type.startsWith('clock_'))
			return app.user.role === 'caregiver' ? '/(app)/me' : '/(app)/dashboard/timesheets';
		if (type.startsWith('note_'))
			return app.user.role === 'caregiver' ? '/(app)/notes' : '/(app)/dashboard/notes';
		if (type === 'referral_status_change' && app.user.role !== 'caregiver')
			return '/(app)/dashboard/intake';
		if (type === 'daily_summary' && app.user.role !== 'caregiver') return '/(app)/dashboard';
		if (type === 'report_ready' && app.user.role !== 'caregiver')
			return '/(app)/dashboard/reports/background';
		if (
			(type === 'access_review' || type === 'email_delivery_problem') &&
			app.user.role === 'admin'
		)
			return '/(app)/dashboard/staff';
		return '/(app)/today';
	}
	async function load(reset = false) {
		busy = true;
		try {
			const start = reset ? 0 : offset;
			const rows = await trpc.notification.list.query({
				channel: 'in_app',
				limit: 50,
				offset: start
			});
			history = reset ? rows : [...history, ...rows];
			offset = start + rows.length;
			more = rows.length === 50;
		} catch {
			message =
				'Showing alerts saved on this device. Connect to refresh, load older alerts, or mark them read.';
		} finally {
			busy = false;
		}
	}
	async function open(id: string) {
		remoteFocus = null;
		try {
			const row = await trpc.notification.get.query({ id });
			if (focusId === id) remoteFocus = row;
		} catch {
			if (focusId === id)
				message = 'This alert is unavailable. Connect and check that it belongs to your account.';
		}
	}
	$effect(() => {
		const id = focusId;
		if (id)
			untrack(() => {
				void open(id);
			});
		else remoteFocus = null;
	});
	onMount(() => {
		void load(true);
	});
	async function mark(ids: string[]) {
		busy = true;
		message = '';
		try {
			await trpc.notification.markRead.mutate({ ids });
			readIds = [...new Set([...readIds, ...ids])];
			message = 'Marked read. Changes will sync to your other devices.';
		} catch {
			message = 'Connect to mark alerts read. Your saved alerts are still available.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Alerts · Guad</title></svelte:head>
<div class="stack">
	<div class="spread">
		<div>
			<p class="eyebrow">Stay in the loop</p>
			<h1>Your alerts, together.</h1>
		</div>
		<a class="btn sec" href={resolve('/(app)/me/notifications')}>Delivery preferences</a>
	</div>
	<p class="muted">
		Recent alerts are saved securely on this device. Connect to refresh, mark alerts read, or load
		older ones.
	</p>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if focused}<article class="card pad stack">
			<p class="eyebrow">Opened alert</p>
			<h2>{focused.title}</h2>
			{#if focused.body}<p class="record-text">{focused.body}</p>{/if}
			<p class="muted">{focused.createdAt.toLocaleString()}</p>
			<div class="actions">
				<a
					class="btn"
					href={followupPerson(focused)
						? resolve('/(app)/people/[id]/medications', { id: followupPerson(focused)! })
						: resolve(destination(focused.type))}>Open related workspace</a
				>{#if !focused.readAt && !readIds.includes(focused.id)}<button
						class="btn sec"
						disabled={busy}
						onclick={() => mark([focused!.id])}>Mark opened alert read</button
					>{:else}<span class="pill ok">Read</span>{/if}
			</div>
		</article>{/if}
	<div class="spread">
		<label class="filter"><input type="checkbox" bind:checked={unreadOnly} />Unread only</label>
		<div class="actions">
			<button
				class="textbtn"
				disabled={busy}
				onclick={() => {
					message = '';
					void load(true);
				}}>Refresh</button
			><button
				class="btn sec"
				disabled={busy || !unread.length}
				onclick={() => mark(unread.slice(0, 100).map((n) => n.id))}
				>Mark {Math.min(unread.length, 100)} read</button
			>
		</div>
	</div>
	{#each visible as alert (alert.id)}<article class="card pad stack">
			<div class="spread">
				<h2><a href={resolve('/(app)/notifications/[id]', { id: alert.id })}>{alert.title}</a></h2>
				<span class="pill" class:ok={!!alert.readAt || readIds.includes(alert.id)}
					>{alert.readAt || readIds.includes(alert.id) ? 'Read' : 'Unread'}</span
				>
			</div>
			{#if alert.body}<p class="record-text">{alert.body}</p>{/if}
			<p class="muted">{alert.createdAt.toLocaleString()}</p>
			<div class="actions">
				<a
					class="textbtn"
					href={followupPerson(alert)
						? resolve('/(app)/people/[id]/medications', { id: followupPerson(alert)! })
						: resolve(destination(alert.type))}>Open related workspace →</a
				>{#if !alert.readAt && !readIds.includes(alert.id)}<button
						class="btn sec"
						disabled={busy}
						onclick={() => mark([alert.id])}>Mark read</button
					>{/if}
			</div>
		</article>{:else}<div class="card empty">
			{unreadOnly
				? 'No unread alerts in this view.'
				: 'No saved alerts yet. New alerts will appear here when synced.'}
		</div>{/each}
	{#if more}<button class="btn sec" disabled={busy} onclick={() => load()}>Load older alerts</button
		>{/if}
</div>

<style>
	.filter {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
	}
	input[type='checkbox'] {
		width: 20px;
		height: 20px;
		accent-color: var(--blue);
	}
	h2 {
		font-size: 18px;
	}
	h2 a {
		color: inherit;
		text-decoration: none;
	}
	h2 a:hover {
		text-decoration: underline;
	}
</style>
