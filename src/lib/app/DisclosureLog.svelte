<script lang="ts">
	// Accounting of disclosures (HIPAA 45 CFR 164.528; security.md
	// "Accounting of disclosures"): what was shared about this person outside
	// care, payment and the agency's operations in the last six years, and
	// the file to give them or their guardian when they ask. Needs a
	// connection; never synced to devices. On every plan.
	import { untrack } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import Skeleton from '#lib/app/Skeleton.svelte';
	import {
		accountingFrom,
		DISCLOSURE_PURPOSES,
		DISCLOSURE_PURPOSE_LABEL,
		type DisclosurePurpose
	} from '#lib/domain/index.ts';

	let { clientId, today }: { clientId: string; today: string } = $props();

	type Accounting = Awaited<ReturnType<typeof trpc.client.disclosures.query>>;
	let accounting = $state<Accounting | null>(null);
	let open = $state(false);
	let busy = $state(false);
	let message = $state('');
	const blank = () => ({
		disclosedOn: today,
		recipient: '',
		address: '',
		description: '',
		purpose: 'abuse_report' as DisclosurePurpose,
		detail: ''
	});
	let form = $state(blank());

	let failed = $state(false);
	async function load() {
		const forPerson = clientId;
		failed = false;
		try {
			const result = await trpc.client.disclosures.query({ clientId: forPerson });
			// Moved to another person meanwhile: their list is loading instead.
			if (forPerson === clientId) accounting = result;
		} catch (e) {
			if (forPerson !== clientId) return;
			failed = true;
			message =
				(e as { data?: { code?: string } })?.data?.code === 'NOT_FOUND'
					? 'This person’s disclosures aren’t available to you.'
					: 'Connect to see disclosures.';
		}
	}
	// The page stays mounted when moving from one person to another, so the
	// list, form and messages are reset for each person.
	$effect(() => {
		void clientId;
		untrack(() => {
			accounting = null;
			open = false;
			message = '';
			form = blank();
			void load();
		});
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			await trpc.client.recordDisclosure.mutate({ clientId, ...form });
			form = blank();
			open = false;
			message = 'Disclosure recorded.';
			await load();
		} catch (e) {
			// Keep what was typed.
			message = e instanceof Error ? e.message : 'Could not save. What you typed is kept here.';
		} finally {
			busy = false;
		}
	}

	async function download() {
		busy = true;
		message = '';
		try {
			const file = await trpc.client.disclosureAccounting.mutate({ clientId });
			const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message =
				'Downloaded. Give it to the person or their guardian within 60 days of their request.';
		} catch {
			message = 'Could not download. Check your connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<h2>Disclosures</h2>
<p class="muted">
	Record what you share about this person outside their care, billing and the agency's own work:
	reports to APS or the state, court orders, police, surveyors. They or their guardian can ask for
	this list going back six years. Incidents reported to the state are added on their own. Entries
	can't be edited; record a new one to correct a mistake.
</p>
<div class="actions">
	{#if !open}<button class="btn sec" onclick={() => (open = true)}>Record a disclosure</button>{/if}
	<button class="btn sec" disabled={busy || !accounting} onclick={download}
		>Download accounting (CSV)</button
	>
</div>
{#if open}
	<form class="card pad stack" onsubmit={save} aria-label="Record a disclosure">
		<label
			>Date shared<input
				class="input"
				type="date"
				min={accountingFrom(today)}
				max={today}
				required
				bind:value={form.disclosedOn}
				disabled={busy}
			/></label
		>
		<label
			>Shared with<input
				class="input"
				maxlength="200"
				required
				placeholder="Agency, office or person"
				bind:value={form.recipient}
				disabled={busy}
			/></label
		>
		<label
			>Their address (if known)<input
				class="input"
				maxlength="500"
				bind:value={form.address}
				disabled={busy}
			/></label
		>
		<label
			>What was shared<input
				class="input"
				maxlength="1000"
				required
				placeholder="For example: incident report and March MAR"
				bind:value={form.description}
				disabled={busy}
			/></label
		>
		<label
			>Why<select class="input" bind:value={form.purpose} disabled={busy}
				>{#each DISCLOSURE_PURPOSES as p (p)}<option value={p}>{DISCLOSURE_PURPOSE_LABEL[p]}</option
					>{/each}</select
			></label
		>
		<label
			>Request or order (optional)<input
				class="input"
				maxlength="1000"
				placeholder="Case number, subpoena, letter"
				bind:value={form.detail}
				disabled={busy}
			/></label
		>
		<div class="actions">
			<button class="btn" disabled={busy}>Save disclosure</button>
			<button type="button" class="btn sec" disabled={busy} onclick={() => (open = false)}
				>Cancel</button
			>
		</div>
	</form>
{/if}
{#if message}<p class="callout" role="status">{message}</p>{/if}
{#if failed}<button class="btn sec" onclick={() => load()}>Try again</button
	>{:else if !accounting}<Skeleton count={1} label="Loading disclosures" />{:else}
	<div class="list card" role="group" aria-label="Disclosure history">
		{#each accounting.entries as e, i (i)}
			<div class="row">
				<span class="grow"
					><b>{e.date} · {e.recipient}</b><span>{e.description}</span><span class="muted"
						>{DISCLOSURE_PURPOSE_LABEL[e.purpose]}{e.source === 'incident'
							? ' · from the incident report'
							: ''}</span
					></span
				>
			</div>
		{:else}
			<div class="row muted">No disclosures in the last six years.</div>
		{/each}
	</div>
{/if}
