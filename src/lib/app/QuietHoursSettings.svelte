<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
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
	async function load() {
		busy = true;
		message = '';
		try {
			const value = await trpc.notification.quietHours.query();
			start = value.start;
			end = value.end;
			saved = { start, end };
			timeZone = value.timeZone;
			agencySet = value.agencySet;
			loaded = true;
		} catch {
			message = 'Connect to load your quiet hours. Your delivery preferences are unchanged.';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void load();
	});
	beforeNavigate(({ cancel }) => {
		if (dirty && !confirm('Leave without saving your quiet hours?')) cancel();
	});
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (agencySet || !valid || !dirty || busy) return;
		busy = true;
		message = '';
		try {
			const value = await trpc.notification.setQuietHours.mutate({ start, end });
			saved = { start: value.start, end: value.end };
			message = 'Quiet hours saved. High and urgent alerts still arrive immediately.';
		} catch {
			message = 'Could not save quiet hours. Reconnect and try again; your choices are still here.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>
<form class="card pad stack" onsubmit={save} aria-label="Quiet hours">
	<h2>Quiet hours</h2>
	<p class="muted">
		Hold normal and low priority push and SMS alerts during a daily period of 4 to 10 hours. High
		and urgent alerts bypass this period. Email and in-app alerts are unaffected.
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
					disabled={busy || agencySet}
				/></label
			><label
				>End time<input
					class="input"
					type="time"
					required
					bind:value={end}
					disabled={busy || agencySet}
				/></label
			>
		</div>
		{#if valid}<p class="muted">
				{quietHoursMinutes(start, end)! / 60} hours{end < start ? ', ending the next day' : ''}.
			</p>{:else}<p class="callout warn">
				Choose a period between 4 and 10 hours. The end can be the next morning.
			</p>{/if}
		<div class="actions">
			<button class="btn sec" disabled={agencySet || busy || !dirty || !valid}
				>Save quiet hours</button
			>{#if dirty}<button
					class="textbtn"
					type="button"
					disabled={busy || agencySet}
					onclick={() => {
						start = saved.start;
						end = saved.end;
					}}>Discard quiet-hours changes</button
				>{/if}
		</div>
	{:else}<button class="btn sec" type="button" disabled={busy || agencySet} onclick={load}
			>{busy ? 'Loading quiet hours…' : 'Load quiet hours'}</button
		>{/if}
	{#if message}<p role="status">{message}</p>{/if}
</form>
