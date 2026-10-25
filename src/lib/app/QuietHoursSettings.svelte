<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { validQuietHours, quietHoursMinutes } from '#lib/domain/quiet-hours.ts';
	let start = $state('');
	let end = $state('');
	let saved = $state({ start: '', end: '' });
	let timeZone = $state('');
	let loaded = $state(false);
	let agencySet = $state(false);
	let busy = $state(false);
	let message = $state('');
	const dirty = $derived(loaded && (start !== saved.start || end !== saved.end));
	const valid = $derived(validQuietHours(start, end));
	const app = useSession();
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
			loaded = false;
			start = end = '';
			saved = { start: '', end: '' };
		}
		if (app.privacyLocked) interrupt();
	});
	onDestroy(interrupt);
	function begin() {
		interrupt();
		const current = generation;
		const account = identity();
		const request = new AbortController();
		controller = request;
		return {
			signal: request.signal,
			current: () =>
				current === generation && account === identity() && canConnect && !request.signal.aborted
		};
	}
	async function load() {
		if (!canConnect || busy) return;
		const operation = begin();
		busy = true;
		message = '';
		try {
			const value = await trpc.notification.quietHours.query(undefined, {
				signal: operation.signal
			});
			if (!operation.current()) return;
			start = value.start;
			end = value.end;
			saved = { start, end };
			timeZone = value.timeZone;
			agencySet = value.agencySet;
			loaded = true;
		} catch {
			if (operation.current())
				message = 'Connect to load your quiet hours. Your delivery preferences are unchanged.';
		} finally {
			if (operation.current()) busy = false;
		}
	}
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
			visible = document.visibilityState === 'visible';
			if (!online || !visible) interrupt();
		};
		update();
		void load();
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
		if (dirty && !confirm('Leave without saving your quiet hours?')) {
			cancel();
			return;
		}
		// Invalidate pending responses at navigation start, but keep choices if another hook cancels.
		interrupt();
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!canConnect || agencySet || !valid || !dirty || busy) return;
		const operation = begin();
		const submitted = { start, end };
		busy = true;
		message = '';
		try {
			const value = await trpc.notification.setQuietHours.mutate(submitted, {
				signal: operation.signal
			});
			if (!operation.current()) return;
			saved = { start: value.start, end: value.end };
			message = 'Quiet hours saved. High and urgent alerts still arrive immediately.';
		} catch {
			if (operation.current())
				message =
					'Could not save quiet hours. Reconnect and try again; your choices are still here.';
		} finally {
			if (operation.current()) busy = false;
		}
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>
{#if !app.privacyLocked}
	<form class="card pad stack" onsubmit={save} aria-label="Quiet hours">
		<h2>Quiet hours</h2>
		<p class="muted">
			Hold normal and low priority push and SMS alerts during a daily period of 4 to 10 hours. High
			and urgent alerts bypass this period. Email and in-app alerts are unaffected.
		</p>
		<p class="muted">
			Interrupted saves may still complete. Reload quiet hours before retrying. Unsaved choices stay
			here when offline or when you cancel leaving.
		</p>
		{#if loaded}{#if agencySet}<p class="callout">
					Your agency sets quiet hours. Ask your administrator to change them.
				</p>{/if}
			<p>Times use your agency’s time zone: <b>{timeZone}</b>.</p>
			<div class="actions">
				<label
					>Start time<input
						class="input"
						type="time"
						required
						bind:value={start}
						disabled={busy || agencySet || !canConnect}
					/></label
				><label
					>End time<input
						class="input"
						type="time"
						required
						bind:value={end}
						disabled={busy || agencySet || !canConnect}
					/></label
				>
			</div>
			{#if valid}<p class="muted">
					{quietHoursMinutes(start, end)! / 60} hours{end < start ? ', ending the next day' : ''}.
				</p>{:else}<p class="callout warn">
					Choose a period between 4 and 10 hours. The end can be the next morning.
				</p>{/if}
			<div class="actions">
				<button class="btn sec" disabled={agencySet || busy || !dirty || !valid || !canConnect}
					>Save quiet hours</button
				>{#if dirty}<button
						class="textbtn"
						type="button"
						disabled={busy || agencySet || !canConnect}
						onclick={() => {
							start = saved.start;
							end = saved.end;
						}}>Discard quiet-hours changes</button
					>{/if}
			</div>
		{:else}<button
				class="btn sec"
				type="button"
				disabled={busy || agencySet || !canConnect}
				onclick={load}>{busy ? 'Loading quiet hours…' : 'Load quiet hours'}</button
			>{/if}
		<button class="textbtn" type="button" disabled={busy || !canConnect || dirty} onclick={load}
			>Reload quiet hours</button
		>
		{#if message}<p role="status">{message}</p>{/if}
	</form>
{/if}
