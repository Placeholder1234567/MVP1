<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useSession, parseJson } from './session.svelte';
	import {
		clock12,
		doseNeedsReason,
		doseReasonLabel,
		doseSlots,
		hhmm,
		localTime,
		medTimes,
		PRN_EFFECTS,
		type DoseStatus
	} from '#lib/domain/index.ts';
	import { canReachServer, insertClinical, timeOf } from './clinical-write';
	import { trpc } from '#lib/trpc.ts';
	import type { Database } from '#lib/sync/schema.ts';
	let {
		clientId,
		onSaved,
		onDirty,
		onBusyChange
	}: {
		clientId: string;
		onSaved?: () => void;
		onDirty?: () => void;
		onBusyChange?: (busy: boolean) => void;
	} = $props();
	onDestroy(() => onBusyChange?.(false));
	const app = useSession();
	const tz = app.user.timeZone;
	const today = localTime(new Date(), tz).day;
	const meds = $derived(
		app.medications
			.filter(
				(m) => m.client_id === clientId && (!m.stopped_at || new Date(m.stopped_at) > new Date())
			)
			.map((m) => ({ ...m, scheduled_times: parseJson<string[]>(m.scheduled_times, []) }))
	);
	const slots = $derived(doseSlots(meds));
	const prnMeds = $derived(meds.filter((m) => !medTimes(m).length));
	const records = $derived(
		app.doses
			.filter((r) => r.client_id === clientId && r.day === today)
			.sort((a, b) => (a.recorded_at ?? '').localeCompare(b.recorded_at ?? ''))
	);
	const certified = $derived(app.user.role !== 'caregiver' || app.user.medCertified);
	type Mar = Database['mar_records'];
	/** The record that answers a scheduled slot (amendments and conflict copies don't). */
	const slotRecord = (medId: string, time: string) =>
		records.find(
			(r) =>
				r.medication_id === medId &&
				!r.is_prn &&
				r.scheduled_time &&
				hhmm(r.scheduled_time) === time &&
				!r.amends_id &&
				!r.conflict_with
		);
	const corrections = (id: string) => records.filter((r) => r.amends_id === id);
	const conflicts = (id: string) => records.filter((r) => r.conflict_with === id);

	/** The open sheet: refusal/hold reason, PRN reason, or a correction. */
	let sheet = $state<{
		medId: string;
		time: string | null;
		status: DoseStatus;
		amends?: Mar;
	}>();
	let reason = $state('');
	let signed = $state(false);
	let busy = $state(false);
	let message = $state('');
	let error = $state('');
	let effectFor = $state('');
	const sheetMed = $derived(meds.find((m) => m.id === sheet?.medId));

	function open(medId: string, time: string | null, status: DoseStatus, amends?: Mar) {
		if (busy) return;
		onDirty?.();
		sheet = { medId, time, status, amends };
		reason = '';
		signed = false;
		error = '';
		message = '';
	}
	async function record(
		medId: string,
		time: string | null,
		status: DoseStatus,
		why: string,
		amends?: Mar
	) {
		if (!certified || busy) return false;
		// Re-check the slot just before writing. If another device recorded it
		// offline, the server keeps both and alerts the supervisor.
		if (!amends && time && slotRecord(medId, time)) {
			error = 'This dose is already recorded.';
			return false;
		}
		busy = true;
		onBusyChange?.(true);
		try {
			await insertClinical(app, 'mar_records', clientId, {
				medication_id: medId,
				day: today,
				scheduled_time: time,
				status,
				reason: why.trim() || null,
				is_prn: time ? 0 : 1,
				amends_id: amends?.id ?? null,
				recorded_at: new Date().toISOString(),
				recorded_by: app.user.profileId,
				recorded_by_name: app.user.name,
				acknowledged: 0
			});
			onSaved?.();
			return true;
		} catch {
			error = 'Could not save. Try again.';
			return false;
		} finally {
			busy = false;
			onBusyChange?.(false);
		}
	}
	async function saveSheet() {
		if (!sheet) return;
		if (!signed) {
			error = 'Confirm your signature before recording this dose.';
			return;
		}
		const prn = !sheet.time;
		if (doseNeedsReason(sheet.status, prn, !!sheet.amends) && !reason.trim()) {
			error = sheet.amends
				? 'Say what was wrong with the earlier entry.'
				: prn
					? 'Add why it was needed.'
					: 'Add what happened so your supervisor and nurse can follow up.';
			return;
		}
		const s = sheet;
		if (await record(s.medId, s.time, s.status, reason, s.amends)) {
			sheet = undefined;
			message = s.amends
				? 'Correction saved. The original entry is kept.'
				: s.status === 'given'
					? 'Recorded. Check back on how it worked.'
					: 'Saved. Your supervisor will be alerted.';
		}
	}
	async function saveEffect(id: string, effect: string) {
		if (busy || !certified || app.privacyLocked) return;
		if (!canReachServer(app)) {
			error = 'Recording the effect needs a connection. Reconnect and let changes sync first.';
			return;
		}
		busy = true;
		onBusyChange?.(true);
		error = '';
		try {
			await trpc.mar.recordEffect.mutate({ id, effect });
			effectFor = '';
			message = 'Effect recorded. It appears here after sync.';
		} catch {
			error = 'Could not record the effect. Try again.';
		} finally {
			busy = false;
			onBusyChange?.(false);
		}
	}
	const statusPill = (s: string | null | undefined) =>
		s === 'given' ? 'ok' : s === 'refused' ? 'bad' : s === 'held' ? 'warn' : 'due';
	const statusLabel = (s: string | null | undefined) =>
		s === 'given' ? 'Given' : s === 'refused' ? 'Refused' : s === 'held' ? 'Held' : 'Due';
	const recordedLine = (r: Mar) =>
		`${r.status === 'given' ? 'Given' : 'Recorded'} at ${timeOf(r.recorded_at, tz)} by ${r.recorded_by_name ?? 'staff'}${r.reason ? ` · ${r.reason}` : ''}`;
</script>

{#snippet history(r: Mar)}
	{#each conflicts(r.id) as c (c.id)}<p class="callout warn s14">
			{c.recorded_by_name ?? 'Someone else'} also recorded this dose at {timeOf(c.recorded_at, tz)}.
			Your supervisor has been alerted.
		</p>{/each}
	{#each corrections(r.id) as c (c.id)}<p class="s14">
			<span class="pill {statusPill(c.status)}">Corrected: {statusLabel(c.status)}</span>
			<span class="muted">{recordedLine(c)}</span>
		</p>{/each}
	{#if certified}<button
			type="button"
			class="textbtn"
			disabled={busy}
			onclick={() =>
				open(
					r.medication_id!,
					r.scheduled_time ? hhmm(r.scheduled_time) : null,
					(r.status as DoseStatus) ?? 'given',
					r
				)}>Correct this entry</button
		>{/if}
{/snippet}

{#snippet reasonSheet()}
	{#if sheet && sheetMed}<form
			class="card pad stack"
			aria-label="Record dose"
			oninput={(event) => {
				if (!(event.target instanceof HTMLInputElement && event.target.dataset.signature))
					signed = false;
			}}
			onsubmit={(e) => {
				e.preventDefault();
				void saveSheet();
			}}
		>
			<h2>
				{sheet.amends
					? `Correct: ${sheetMed.name}`
					: !sheet.time
						? `Give ${sheetMed.name}`
						: `${statusLabel(sheet.status)}: ${sheetMed.name}`}
			</h2>
			{#if !sheet.time && sheetMed.prn_instructions}<p class="muted s14">
					{sheetMed.prn_instructions}
				</p>{/if}
			{#if sheet.amends}<p class="muted s14">
					The original entry ({statusLabel(sheet.amends.status)}, {recordedLine(sheet.amends)})
					stays on the record. What should it say?
				</p>
				<div class="choice" role="group" aria-label="Corrected status">
					{#each ['given', 'refused', 'held'] as const as s (s)}<button
							type="button"
							aria-pressed={sheet.status === s}
							onclick={() => {
								if (sheet) {
									sheet.status = s;
									signed = false;
									onDirty?.();
								}
							}}>{statusLabel(s)}</button
						>{/each}
				</div>{/if}
			<label
				>{doseNeedsReason(sheet.status, !sheet.time, !!sheet.amends)
					? doseReasonLabel(sheet.status, !sheet.time, !!sheet.amends)
					: 'Notes (optional)'}<textarea class="input" maxlength="500" bind:value={reason}
				></textarea></label
			>
			{#if sheet.time && sheet.status !== 'given' && !sheet.amends}<p class="muted s13">
					Your supervisor will be alerted.
				</p>{/if}
			{#if error}<p class="callout bad" role="alert">{error}</p>{/if}
			<label class="check"
				><input type="checkbox" data-signature="true" bind:checked={signed} /><span
					>I, {app.user.name}, confirm this dose record is accurate.</span
				></label
			>
			<button class="btn full" disabled={busy || !signed}>Sign and record {sheet.status}</button>
			<button type="button" class="btn sec full" onclick={() => (sheet = undefined)}>Cancel</button>
		</form>{/if}
{/snippet}

<fieldset class="stack care-fields" disabled={busy} aria-label="Care record editor">
	<p class="callout warn">
		Check the right person, medication, dose, time and route against the label before giving.
	</p>
	{#if !certified}<p class="callout">
			Only med-certified staff can record medications. You can see today’s record.
		</p>{/if}
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if error && !sheet}<p class="callout bad" role="alert">{error}</p>{/if}
	{#if !slots.length && !prnMeds.length}<p class="card empty">
			No medications are listed for this person.
		</p>{/if}
	{#if slots.length}<div class="section-title"><h2>Scheduled today</h2></div>{/if}
	{#each slots as slot (`${slot.medicationId}:${slot.time}`)}{@const med = meds.find(
			(m) => m.id === slot.medicationId
		)!}{@const r = slotRecord(med.id, slot.time)}
		<article class="card pad stack dose">
			<div class="spread top">
				<div>
					<b class="name">{med.name}</b>
					<p class="muted s14">
						{[med.dose, med.route, clock12(slot.time), med.notes].filter(Boolean).join(' · ')}
					</p>
				</div>
				<span class="pill {statusPill(r?.status)}">{statusLabel(r?.status)}</span>
			</div>
			{#if r}<p class="muted s14">{recordedLine(r)}</p>
				{@render history(r)}
			{:else if certified}{#if sheet?.medId === med.id && sheet.time === slot.time && !sheet.amends}{@render reasonSheet()}{:else}<button
						type="button"
						class="btn full"
						disabled={busy}
						onclick={() => open(med.id, slot.time, 'given')}>✓ Mark as given</button
					>
					<div class="grid2">
						<button
							type="button"
							class="btn sec"
							disabled={busy}
							onclick={() => open(med.id, slot.time, 'refused')}>Refused</button
						><button
							type="button"
							class="btn sec"
							disabled={busy}
							onclick={() => open(med.id, slot.time, 'held')}>Held</button
						>
					</div>{/if}{/if}
			{#if r && sheet?.amends?.id === r.id}{@render reasonSheet()}{/if}
		</article>{/each}
	{#if prnMeds.length}<div class="section-title"><h2>As needed</h2></div>{/if}
	{#each prnMeds as med (med.id)}{@const given = records.filter(
			(r) => r.medication_id === med.id && r.is_prn && !r.amends_id
		)}
		<article class="card pad stack dose">
			<div>
				<b class="name">{med.name}</b>
				<p class="muted s14">
					{[med.dose, med.route, med.prn_instructions].filter(Boolean).join(' · ')}
				</p>
			</div>
			{#each given as r (r.id)}<div class="stack prn-given">
					<p class="s14">
						<span class="pill {statusPill(r.status)}">{statusLabel(r.status)}</span>
						{timeOf(r.recorded_at, tz)} by {r.recorded_by_name ?? 'staff'}{r.reason
							? ` for: ${r.reason}`
							: ''}
					</p>
					{#if r.effect}<p class="muted s14">Effect: {r.effect}</p>
					{:else if r.status === 'given' && certified}{#if effectFor === r.id}<div
								class="choice"
								role="group"
								aria-label="Did it help?"
							>
								{#each PRN_EFFECTS as effect (effect)}<button
										type="button"
										disabled={busy}
										onclick={() => saveEffect(r.id, effect)}>{effect}</button
									>{/each}
							</div>{:else}<button
								type="button"
								class="btn sec"
								disabled={busy}
								onclick={() => {
									effectFor = r.id;
									error = '';
								}}>Record whether it helped</button
							>{/if}{/if}
					{@render history(r)}
					{#if sheet?.amends?.id === r.id}{@render reasonSheet()}{/if}
				</div>{/each}
			{#if certified}{#if sheet?.medId === med.id && !sheet.time && !sheet.amends}{@render reasonSheet()}{:else}<button
						type="button"
						class="btn sec full"
						disabled={busy}
						onclick={() => open(med.id, null, 'given')}>Give as needed</button
					>{/if}{/if}
		</article>{/each}
</fieldset>

<style>
	.care-fields {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}

	.dose {
		gap: 12px;
	}
	.dose .top {
		align-items: flex-start;
		flex-wrap: nowrap;
	}
	.name {
		font-size: 17px;
	}
	.prn-given {
		gap: 8px;
		border-top: 1px solid var(--line);
		padding-top: 12px;
	}
</style>
