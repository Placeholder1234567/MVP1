<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { addDays, localTime } from '#lib/domain/index.ts';
	import {
		CLINICAL_TYPES,
		clinicalPeriod,
		type ClinicalType
	} from '#lib/domain/clinical-export.ts';
	import { ReportJobGuard, reportCanConnect, reportStillRunning } from '#lib/app/report-job.ts';
	const app = useSession();
	const today = localTime(new Date(), app.user.timeZone).day;
	let fromDay = $state(addDays(today, -6));
	let toDay = $state(today);
	let type = $state<ClinicalType>('notes');
	let format = $state<'csv' | 'json' | 'html' | 'pdf'>('csv');
	let clientId = $state('');
	let approvedOnly = $state(false);
	type Job = Awaited<ReturnType<typeof trpc.report.backgroundStatus.mutate>>;
	let job = $state<Job | null>(null);
	let busy = $state(false);
	let message = $state('');
	let online = $state(false);
	let visible = $state(false);
	let controller: AbortController | undefined;
	let context = '';
	const guard = new ReportJobGuard();
	const canConnect = $derived(reportCanConnect(online, visible, app.privacyLocked));
	const availableHomes = $derived(
		app.homes.filter((home) => app.user.role === 'admin' || app.user.homeIds.includes(home.id))
	);
	const allowedHome = $derived(availableHomes.some((home) => home.id === app.homeId));
	const labels: Record<ClinicalType, string> = {
		notes: 'Signed notes',
		mar: 'Medication administration',
		health: 'Health entries',
		incidents: 'Incident log',
		attendance: 'Attendance',
		goals: 'Goal progress and trial history'
	};
	// Locking forgets the local reference; it does not cancel a server job.
	$effect(() => {
		const next = JSON.stringify([
			app.user.agencyId,
			app.user.profileId,
			app.homeId,
			app.privacyLocked
		]);
		if (guard.change(next)) {
			controller?.abort();
			job = null;
			busy = false;
			message = '';
			clientId = '';
			context = next;
		}
	});
	// Check the live session again after every await, before exposing data or downloading.
	function begin() {
		const current = context;
		const generationCurrent = guard.capture();
		const valid = () =>
			generationCurrent() &&
			!app.privacyLocked &&
			allowedHome &&
			current ===
				JSON.stringify([app.user.agencyId, app.user.profileId, app.homeId, app.privacyLocked]);
		controller = new AbortController();
		const abort = controller;
		const timeout = setTimeout(() => abort.abort(), 30000);
		busy = true;
		return {
			valid,
			signal: abort.signal,
			finish: () => {
				clearTimeout(timeout);
				if (generationCurrent()) busy = false;
			}
		};
	}
	async function request(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !canConnect || !allowedHome || reportStillRunning(job?.status)) return;
		message = '';
		try {
			clinicalPeriod(fromDay, toDay, app.user.timeZone);
		} catch {
			message = 'Choose one to 93 calendar days.';
			return;
		}
		if (clientId && !app.currentPeople.some((person) => person.id === clientId)) {
			message = 'Choose a person in the selected home.';
			return;
		}
		const operation = begin();
		const input = {
			type,
			format,
			homeId: app.homeId,
			clientId: clientId || undefined,
			fromDay,
			toDay,
			approvedOnly,
			expectedProfileId: app.user.profileId
		};
		try {
			await app.refreshUploadStatus();
			if (!operation.valid() || !canConnect) return;
			if (app.pending || app.checkingSync) {
				message =
					'Wait for this device’s saved changes to finish syncing before requesting a report.';
				return;
			}
			// No automatic retry: an interrupted request might already have queued a job.
			job = null;
			const result = await trpc.report.requestBackground.mutate(input, {
				signal: operation.signal
			});
			if (operation.valid()) job = result;
		} catch {
			if (operation.valid())
				message =
					'Could not confirm the report request. It may still be running. Check your connection and permissions before requesting another report.';
		} finally {
			operation.finish();
		}
	}
	async function refresh() {
		if (busy || !canConnect || !job) return;
		const id = job.id;
		const operation = begin();
		try {
			const result = await trpc.report.backgroundStatus.mutate(
				{ id, expectedProfileId: app.user.profileId },
				{ signal: operation.signal }
			);
			if (operation.valid() && job?.id === id) {
				job = result;
				message = '';
			}
		} catch {
			if (operation.valid())
				message =
					'Could not check progress. Reconnect and check your report permissions, then refresh.';
		} finally {
			operation.finish();
		}
	}
	async function download() {
		if (busy || !canConnect || job?.status !== 'ready') return;
		const id = job.id;
		const operation = begin();
		try {
			const file = await trpc.report.downloadBackground.mutate(
				{ id, expectedProfileId: app.user.profileId },
				{ signal: operation.signal }
			);
			if (!operation.valid() || !canConnect || job?.id !== id) return;
			const body =
				file.encoding === 'base64'
					? Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))
					: file.content;
			const blob = new Blob([body], { type: file.contentType });
			if (blob.size > 8 * 1024 * 1024) throw new Error('Report limit');
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message = `Downloaded ${file.rows} records. Keep exports in approved agency storage.`;
		} catch {
			if (operation.valid())
				message =
					'Could not download the report. Refresh its status and check your connection and report permissions.';
		} finally {
			operation.finish();
		}
	}
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
			visible = document.visibilityState === 'visible';
		};
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		document.addEventListener('visibilitychange', update);
		const interval = setInterval(() => {
			if (reportStillRunning(job?.status)) void refresh();
		}, 5000);
		return () => {
			guard.change('disposed');
			controller?.abort();
			clearInterval(interval);
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
			document.removeEventListener('visibilitychange', update);
		};
	});
</script>

<svelte:head><title>Queued care reports · Guad</title></svelte:head>
<div class="stack">
	<a class="textbtn" href={resolve('/(app)/dashboard/reports')}>← Care reports</a>
	<p class="eyebrow">Care records</p>
	<h1>Prepare a larger care report.</h1>
	<p class="muted">
		Request a report from records received by the server. Progress updates while this page is
		visible, connected and unlocked. Download only when you choose.
	</p>
	<p class="muted">
		Dates include both selected days in {app.user.timeZone}. Maximum 93 calendar days, 10,000
		records for CSV, structured data and HTML, or 2,000 records for PDF; 8 MB per file. No partial
		file is produced if a limit is exceeded.
	</p>
	<form class="card pad stack" onsubmit={request}>
		<label
			>Report home<select class="input" bind:value={app.homeId} required>
				{#if !allowedHome}<option value={app.homeId} disabled>Choose an assigned home</option>{/if}
				{#each availableHomes as home (home.id)}<option value={home.id}>{home.name}</option>{/each}
			</select></label
		>
		<p class="muted">
			Queued reports are limited to your assigned homes; administrators can select any agency home.
		</p>
		<label
			>Report<select class="input" bind:value={type}
				>{#each CLINICAL_TYPES as item (item)}<option value={item}>{labels[item]}</option
					>{/each}</select
			></label
		>
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
				><option value="csv">CSV spreadsheet</option><option value="json">Structured data</option
				><option value="html">Print-ready HTML</option><option value="pdf">PDF</option></select
			></label
		>
		{#if type === 'notes' || type === 'goals'}
			<label><input type="checkbox" bind:checked={approvedOnly} /> Approved notes only</label>
			<p class="muted">
				Includes submitted and approved signed notes; drafts and returned notes are excluded. Dates
				follow the shift start day, including overnight shifts. Available signing and approval
				history is included; missing events are not new signatures.
			</p>
			{#if type === 'goals'}<p class="muted">
					Uses recorded trials, including stopped goals. Independent rates include refused trials;
					not-attempted and empty trials are separate. Goal definitions are current; missing days
					and target achievement are not inferred.
				</p>{/if}
		{:else if type === 'mar'}<p class="muted">
				Includes recorded dose outcomes, amendments and conflicts by dose day. Current prescription
				details are omitted to avoid presenting changed prescriptions as historical doses.
			</p>
		{:else if type === 'incidents'}<p class="muted">
				Includes incidents by occurrence time; records without an occurrence time are excluded.
			</p>
		{:else if type === 'health'}<p class="muted">
				Includes health entries and acknowledgment flags from the first day’s midnight through the
				midnight after the last day.
			</p>
		{:else}<p class="muted">Includes recorded attendance by service day.</p>{/if}
		{#if app.pending || app.checkingSync}<p role="status">
				Wait for this device’s saved changes to finish syncing before requesting a report.
			</p>{/if}
		<button
			class="btn"
			disabled={busy ||
				!canConnect ||
				!allowedHome ||
				!!app.pending ||
				app.checkingSync ||
				reportStillRunning(job?.status)}>Request background report</button
		>
	</form>
	{#if !online}<p role="status" class="callout">
			Connect to request, check or download a report. A report already requested can keep running on
			the server.
		</p>{/if}
	{#if job}<section class="card pad stack" aria-label="Current report">
			<h2>Report {job.status}</h2>
			<p>{labels[job.type]} · {job.format.toUpperCase()}</p>
			{#if job.status === 'ready'}<p>
					{job.rows ?? 0} records ready. Files are retained for 24 hours after preparation.
				</p>
				<button class="btn" onclick={download} disabled={busy || !canConnect}
					>Download prepared report</button
				>
			{:else if job.status === 'failed' || job.status === 'expired'}<p>
					This report {job.status === 'failed' ? 'could not be prepared' : 'has expired'}. Review
					the selection and explicitly request a new report. It will not retry automatically.
				</p>
			{:else}<p>Waiting for the server. Preparation must finish within 15 minutes.</p>{/if}
			<button class="textbtn" onclick={refresh} disabled={busy || !canConnect}
				>Refresh report status</button
			>
		</section>{/if}
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	<p class="muted">
		Only this page remembers the most recent report. Leaving, reloading, locking or changing homes
		forgets that reference; it does not cancel a server report. There is no report history here.
		Exported files contain confidential care information.
	</p>
</div>
