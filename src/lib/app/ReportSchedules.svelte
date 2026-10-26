<script lang="ts">
	// Scheduled care reports (Complete plan; domain/report-schedule.ts): the
	// same report built every week or month for the period just ended. It
	// appears in "Recent requests" for its home, kept 7 days, and an alert
	// says when it's ready. Each person sees and manages only their own.
	import { onMount } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import { useSession } from '#lib/app/session.svelte.ts';
	import {
		CLINICAL_TYPE_FEATURE,
		CLINICAL_TYPE_LABEL,
		CLINICAL_TYPES,
		type ClinicalType
	} from '#lib/domain/clinical-export.ts';
	import {
		MAX_SCHEDULES,
		REPORT_FREQUENCIES,
		REPORT_RUN_HOUR,
		SCHEDULED_REPORT_DAYS,
		scheduleLabel,
		WEEKDAY_LABEL,
		type ReportFrequency
	} from '#lib/domain/index.ts';

	const app = useSession();
	type Schedule = Awaited<ReturnType<typeof trpc.report.schedules.query>>[number];
	let schedules = $state<Schedule[] | null>(null);
	let type = $state<ClinicalType>('notes');
	let format = $state<'csv' | 'pdf'>('pdf');
	let frequency = $state<ReportFrequency>('weekly');
	let weekday = $state(1);
	let approvedOnly = $state(false);
	let busy = $state(false);
	let message = $state('');
	const homeName = (id: string) => app.homes.find((h) => h.id === id)?.name ?? 'A home';
	const types = $derived(
		CLINICAL_TYPES.filter((t) => app.user.features.includes(CLINICAL_TYPE_FEATURE[t]))
	);

	async function load() {
		try {
			schedules = await trpc.report.schedules.query();
		} catch {
			message = 'Connect to see your scheduled reports.';
		}
	}
	onMount(load);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (!app.homeId) return;
		busy = true;
		message = '';
		try {
			await trpc.report.createSchedule.mutate({
				homeId: app.homeId,
				type,
				format,
				frequency,
				weekday,
				approvedOnly: (type === 'notes' || type === 'goals') && approvedOnly
			});
			message = 'Scheduled. You’ll get an alert when each report is ready.';
			await load();
		} catch (e) {
			message = serviceMessage(
				e,
				'Could not schedule this report. Connect and check your access to this home.'
			);
		} finally {
			busy = false;
		}
	}

	/** The server's own wording for rule and input problems (no care details). */
	function serviceMessage(e: unknown, fallback: string) {
		const code = (e as { data?: { code?: string } })?.data?.code;
		return (code === 'BAD_REQUEST' || code === 'CONFLICT') && e instanceof Error
			? e.message
			: fallback;
	}

	async function resume(id: string) {
		busy = true;
		message = '';
		try {
			await trpc.report.resumeSchedule.mutate({ id });
			message = 'Scheduled report turned back on.';
			await load();
		} catch (e) {
			message = serviceMessage(
				e,
				'Could not turn it back on. You may still not have access to this home or report.'
			);
		} finally {
			busy = false;
		}
	}

	/** The latest report a schedule made, from any home (it's listed under its own home too). */
	async function downloadLatest(id: string) {
		busy = true;
		message = '';
		try {
			const file = await trpc.report.downloadBackground.mutate({
				id,
				expectedProfileId: app.user.profileId
			});
			const body =
				file.encoding === 'base64'
					? Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))
					: file.content;
			const url = URL.createObjectURL(new Blob([body], { type: file.contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message = 'Downloaded. Keep exports in approved agency storage.';
		} catch {
			message = 'That report isn’t ready yet, or it has expired (reports are kept 7 days).';
		} finally {
			busy = false;
		}
	}

	async function remove(id: string) {
		busy = true;
		message = '';
		try {
			await trpc.report.deleteSchedule.mutate({ id });
			message = 'Scheduled report removed.';
			await load();
		} catch {
			message = 'Could not remove it. Connect and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="stack" aria-labelledby="scheduled-reports">
	<h2 id="scheduled-reports">Scheduled reports</h2>
	<p class="muted">
		Get the same report every week or month, for the period just ended, for the home chosen above.
		Each is ready to download here for {SCHEDULED_REPORT_DAYS} days, and you get an alert (no care details
		in it). Up to {MAX_SCHEDULES} running. Reports are built from {REPORT_RUN_HOUR}:00, after the
		overnight shift. It stops if you lose access to the home.
	</p>
	<form class="card pad stack" onsubmit={add} aria-label="Schedule a report">
		<label
			>Report to schedule<select class="input" bind:value={type} disabled={busy}
				>{#each types as t (t)}<option value={t}>{CLINICAL_TYPE_LABEL[t]}</option>{/each}</select
			></label
		>
		<label
			>How often<select class="input" bind:value={frequency} disabled={busy}
				>{#each REPORT_FREQUENCIES as f (f)}<option value={f}
						>{f === 'weekly'
							? 'Every week (the 7 days before)'
							: 'Every month (last month)'}</option
					>{/each}</select
			></label
		>
		{#if frequency === 'weekly'}<label
				>Day<select class="input" bind:value={weekday} disabled={busy}
					>{#each WEEKDAY_LABEL as d, i (d)}<option value={i + 1}>{d}</option>{/each}</select
				></label
			>{/if}
		<label
			>File type<select class="input" bind:value={format} disabled={busy}
				><option value="pdf">PDF for printing and sharing</option><option value="csv"
					>CSV spreadsheet</option
				></select
			></label
		>
		{#if type === 'notes' || type === 'goals'}<label
				><input type="checkbox" bind:checked={approvedOnly} disabled={busy} /> Only approved notes</label
			>{/if}
		<div class="actions">
			<button class="btn" disabled={busy || !app.homeId}>Schedule report</button>
		</div>
	</form>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if schedules}
		<div class="list card" role="group" aria-label="Your scheduled reports">
			{#each schedules as s (s.id)}
				<div class="row">
					<span class="grow"
						><b
							>{CLINICAL_TYPE_LABEL[s.type as ClinicalType] ?? s.type} · {s.format.toUpperCase()}</b
						><span
							>{homeName(s.homeId)} · {scheduleLabel(
								s.frequency as ReportFrequency,
								s.weekday
							)}{s.approvedOnly ? ' · approved notes only' : ''}</span
						><span class="muted"
							>{s.active
								? `Next: ${s.nextRunOn}`
								: 'Stopped: you lost access to this report. Turn it back on once you have it again.'}</span
						></span
					>
					{#if s.lastReportId}<button
							class="textbtn"
							disabled={busy}
							onclick={() => downloadLatest(s.lastReportId!)}
							aria-label={`Download the latest ${CLINICAL_TYPE_LABEL[s.type as ClinicalType] ?? s.type} report for ${homeName(s.homeId)}`}
							>Download latest</button
						>{/if}
					{#if !s.active}<button
							class="textbtn"
							disabled={busy}
							onclick={() => resume(s.id)}
							aria-label={`Turn back on the ${CLINICAL_TYPE_LABEL[s.type as ClinicalType] ?? s.type} schedule for ${homeName(s.homeId)}`}
							>Turn back on</button
						>{/if}
					<button
						class="textbtn"
						disabled={busy}
						onclick={() => remove(s.id)}
						aria-label={`Remove ${CLINICAL_TYPE_LABEL[s.type as ClinicalType] ?? s.type} schedule for ${homeName(s.homeId)}`}
						>Remove</button
					>
				</div>
			{:else}
				<div class="row muted">No scheduled reports.</div>
			{/each}
		</div>
	{/if}
</section>
