<script lang="ts">
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { resolve } from '$app/paths';
	const app = useSession();
	const localInput = (d: Date) =>
		new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
	let from = $state(localInput(new Date(Date.now() - 7 * 86400000)));
	let to = $state(localInput(new Date(Date.now() + 60000)));
	let report = $state<Awaited<ReturnType<typeof trpc.clock.timesheet.query>> | null>(null);
	let reportRange = $state<{ from: Date; to: Date; homeId: string } | null>(null);
	let busy = $state(false);
	let message = $state('');
	let person = $state('');
	let entryIn = $state('');
	let entryOut = $state('');
	let reason = $state('');
	async function load() {
		const requested = { from: new Date(from), to: new Date(to), homeId: app.homeId };
		busy = true;
		message = '';
		try {
			report = await trpc.clock.timesheet.query({
				homeId: requested.homeId,
				dateRange: { from: requested.from, to: requested.to }
			});
			reportRange = requested;
		} catch {
			message = 'Could not load this report. Connect and check the date range.';
		} finally {
			busy = false;
		}
	}
	async function acknowledge(id: string) {
		busy = true;
		try {
			await trpc.clock.acknowledge.mutate({ id });
			await load();
		} catch {
			message = 'Could not acknowledge this entry.';
		} finally {
			busy = false;
		}
	}
	async function manual(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			await trpc.clock.manualEntry.mutate({
				profileId: person,
				homeId: app.homeId,
				clockInAt: new Date(entryIn),
				clockOutAt: new Date(entryOut),
				reason
			});
			entryIn = '';
			entryOut = '';
			reason = '';
			await load();
		} catch {
			message =
				'Could not add the entry. Check the staff member, time range and any overlapping records.';
		} finally {
			busy = false;
		}
	}
	async function exportReport(format: 'csv' | 'json') {
		if (!reportRange || busy) return;
		busy = true;
		message = '';
		try {
			const file = await trpc.report.exportTimesheet.mutate({
				homeId: reportRange.homeId,
				from: reportRange.from,
				to: reportRange.to,
				format
			});
			const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message = `Exported ${file.rows} records. Keep downloaded files in your agency’s approved storage.`;
		} catch {
			message =
				'Could not export. Reconnect and check your report permissions or choose a shorter period.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Timesheets · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Timekeeping</p>
	<h1>Make every hour clear.</h1>
	<a class="textbtn" href={resolve('/(app)/dashboard/reports')}>Care record reports →</a>
	<p class="muted">
		Choose a period, review location exceptions, then export. Date inputs use your device’s time
		zone.
	</p>
	<form
		class="card pad stack"
		onsubmit={(e) => {
			e.preventDefault();
			void load();
		}}
	>
		<div class="grid">
			<label>From<input class="input" type="datetime-local" required bind:value={from} /></label
			><label>To<input class="input" type="datetime-local" required bind:value={to} /></label>
		</div>
		<button class="btn" disabled={busy || !app.homeId}>Load timesheet</button>
	</form>
	{#if message}<p role="status" class="callout">{message}</p>{/if}
	{#if report}<p class="muted">
			Report: {reportRange?.from.toLocaleString()} to {reportRange?.to.toLocaleString()} · {app.homes.find(
				(h) => h.id === reportRange?.homeId
			)?.name}
		</p>
		<div class="stats">
			<div class="card pad">
				<p class="muted">Total hours</p>
				<p class="stat-number">{report.totalHours.toFixed(2)}</p>
			</div>
			<div class="card pad">
				<p class="muted">Location verified</p>
				<p class="stat-number">{report.verifiedHours.toFixed(2)}</p>
			</div>
			<div class="card pad">
				<p class="muted">Manual entries</p>
				<p class="stat-number">{report.manualHours.toFixed(2)}</p>
			</div>
		</div>
		<div class="spread">
			<button class="btn sec" disabled={busy} onclick={() => exportReport('csv')}
				>Download CSV</button
			><button class="btn sec" disabled={busy} onclick={() => exportReport('json')}
				>Download JSON</button
			>
		</div>
		<p class="muted">
			Exports refresh this loaded period from the server and record an audit event. Up to 5,000
			records and one year per export. Staff and home IDs are stable payroll references; location
			coordinates and correction reasons are excluded. Open shifts contribute zero hours.
		</p>
		{#each report.entries as row (row.id)}<article class="card pad stack">
				<div class="spread">
					<b>{app.staff.find((p) => p.id === row.profile_id)?.name ?? 'Staff member'}</b><span
						class="pill"
						class:bad={!row.verified && !row.acknowledged}
						>{row.acknowledged
							? 'Acknowledged'
							: row.verified
								? 'Location verified'
								: 'Needs review'}</span
					>
				</div>
				<p>
					{row.clock_in_at.toLocaleString()} → {row.clock_out_at?.toLocaleString() ??
						'Still clocked in'}
				</p>
				{#if row.reason}<p class="record-text">
						{row.reason}
					</p>{/if}{#if !row.acknowledged && (!row.verified || row.manual_override)}<button
						class="btn sec"
						disabled={busy}
						onclick={() => acknowledge(row.id)}>Acknowledge reviewed entry</button
					>{/if}
			</article>{:else}<div class="card empty">No clock records in this period.</div>{/each}{/if}
	<form class="card pad stack" onsubmit={manual}>
		<h2>Correct a missed punch</h2>
		<label
			>Staff member<select class="input" required bind:value={person}
				><option value="">Choose a staff member</option
				>{#each app.staff.filter((p) => p.active) as member (member.id)}<option value={member.id}
						>{member.name}</option
					>{/each}</select
			></label
		>
		<div class="grid">
			<label
				>Clock-in<input class="input" type="datetime-local" required bind:value={entryIn} /></label
			><label
				>Clock-out<input
					class="input"
					type="datetime-local"
					required
					bind:value={entryOut}
				/></label
			>
		</div>
		<label
			>Reason<textarea class="input" required maxlength="1000" bind:value={reason}
			></textarea></label
		><button class="btn sec" disabled={busy || !app.homeId}>Add manual entry for review</button>
	</form>
</div>
