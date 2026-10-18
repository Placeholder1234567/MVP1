<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { addDays, localTime } from '#lib/domain/index.ts';
	import { CLINICAL_TYPES, type ClinicalType } from '#lib/domain/clinical-export.ts';
	const app = useSession();
	const today = localTime(new Date(), app.user.timeZone).day;
	let fromDay = $state(addDays(today, -6));
	let toDay = $state(today);
	let type = $state<ClinicalType>('notes');
	let format = $state<'csv' | 'json' | 'html'>('csv');
	let clientId = $state('');
	let approvedOnly = $state(false);
	let busy = $state(false);
	let message = $state('');
	const labels = {
		notes: 'Signed notes',
		mar: 'Medication administration',
		health: 'Health entries',
		incidents: 'Incident log',
		attendance: 'Attendance',
		goals: 'Goal progress and trial history'
	};
	async function download(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !app.homeId) return;
		busy = true;
		message = '';
		try {
			await app.refreshUploadStatus();
			if (app.pending || app.checkingSync) {
				message =
					'Wait for this device’s saved changes to finish syncing before downloading a care report.';
				return;
			}
			const file = await trpc.report.exportClinical.mutate({
				type,
				format,
				homeId: app.homeId,
				clientId: clientId || undefined,
				fromDay,
				toDay,
				approvedOnly
			});
			const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message = `Downloaded ${file.rows} records. ${format === 'html' ? 'Open the HTML file and use your browser’s Print command to print or save as PDF. ' : ''}Keep exports in approved agency storage.`;
		} catch {
			message =
				'Could not export. Connect and check your report permissions, selected home and person. Use at most 93 days and a smaller period if the report exceeds 1,000 records or 8 MB.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Care reports · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Care records</p>
	<h1>Records ready for review.</h1>
	<a class="textbtn" href={resolve('/(app)/dashboard/imports')}>Review CSV imports →</a>
	<p class="muted">
		Download an audited report from the server. Dates include both selected days in {app.user
			.timeZone}. Reports require a connection and your agency’s reporting and care feature
		permissions.
	</p>
	<a class="textbtn" href={resolve('/(app)/dashboard/timesheets')}>Payroll and timesheets →</a>
	{#if page.data.user?.features?.includes('mar')}<a class="textbtn" href={resolve('/(app)/dashboard/medications')}>Manage medication definitions →</a>{/if}
	{#if page.data.user?.features?.includes('goals')}<a class="textbtn" href={resolve('/(app)/dashboard/goals')}>Manage goals and templates →</a>{/if}
	<form class="card pad stack" onsubmit={download}>
		<label
			>Report<select class="input" bind:value={type}
				>{#each CLINICAL_TYPES as item (item)}<option value={item}>{labels[item]}</option
					>{/each}</select
			></label
		>
		<p class="muted">
			Home: {app.homes.find((h) => h.id === app.homeId)?.name ??
				'Choose a home in the app navigation'}
		</p>
		<label
			>Person<select class="input" bind:value={clientId}
				><option value="">Everyone in this home</option
				>{#each app.currentPeople as person (person.id)}<option value={person.id}
						>{person.name}</option
					>{/each}</select
			></label
		>
		<div class="grid">
			<label>From<input class="input" type="date" required bind:value={fromDay} /></label><label
				>Through<input class="input" type="date" required bind:value={toDay} /></label
			>
		</div>
		<label
			>Format<select class="input" bind:value={format}
				><option value="csv">CSV spreadsheet</option><option value="json">Structured JSON</option
				><option value="html">Print-ready HTML / save as PDF</option></select
			></label
		>
		{#if type === 'notes' || type === 'goals'}<label
				><input type="checkbox" bind:checked={approvedOnly} /> Approved notes only</label
			>
			{#if type === 'goals'}<p class="muted">
					Uses recorded goal trials from signed/approved notes, including stopped goals. Independent
					rates include refused trials in the denominator. Not-attempted records and empty trials
					are reported separately. Goal text is the current definition; missing days and target
					achievement are not inferred.
				</p>{/if}
			<p class="muted">
				Includes submitted and approved notes; drafts and returned notes are excluded. Dates use the
				shift start day, including overnight shifts. Available signing and approval history is
				included; a missing event is not a new signature.
			</p>{:else if type === 'mar'}<p class="muted">
				Includes every recorded dose outcome, amendment and conflict in the dose-day range.
				Medication IDs refer to the source record; current medication details are omitted to avoid
				presenting changed prescriptions as historical doses.
			</p>{:else if type === 'incidents'}<p class="muted">
				Includes open, reviewed and closed incidents by occurrence time. Incidents without an
				occurrence time are excluded.
			</p>{:else if type === 'health'}<p class="muted">
				Includes recorded health entries and acknowledgment flags, from the first day’s midnight
				through the midnight after the last day.
			</p>{:else}<p class="muted">Includes recorded attendance services by service day.</p>{/if}
		<p class="muted">
			Maximum 93 calendar days, 1,000 records and 8 MB. No partial report is downloaded when a limit
			is exceeded. Exported files contain confidential care information.
		</p>
		{#if app.pending || app.checkingSync}<p role="status" class="muted">
				Reports use records received by the server. Wait for this device’s saved changes to finish
				syncing.
			</p>{/if}
		<button class="btn" disabled={busy || !app.homeId || !!app.pending || app.checkingSync}
			>{busy ? 'Preparing report…' : 'Download care report'}</button
		>
	</form>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
</div>
