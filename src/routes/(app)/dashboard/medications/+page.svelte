<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { CONTROLLED_SCHEDULES, type ControlledSchedule } from '#lib/domain/index.ts';
	const app = useSession();
	type Medication = Awaited<ReturnType<typeof trpc.medication.list.query>>[number];
	type History = Awaited<ReturnType<typeof trpc.medication.history.query>>;
	let homeId = $state(untrack(() => app.homeId)),
		personId = $state('');
	let medications = $state<Medication[]>([]);
	let loading = $state(false),
		loadedPerson = $state(''),
		busy = $state(false),
		online = $state(true);
	let message = $state('');
	let editing = $state(''),
		name = $state(''),
		dose = $state(''),
		route = $state(''),
		times = $state(''),
		prn = $state(''),
		notes = $state(''),
		controlled = $state(false),
		schedule = $state(''),
		unitsPerDose = $state('1');
	let when = $state<'scheduled' | 'prn'>('scheduled');
	let dirty = $state(false);
	let history = $state<History>([]),
		historyId = $state(''),
		historyName = $state(''),
		historyLoading = $state(false),
		historyMessage = $state('');
	let version = 0,
		historyVersion = 0;
	$effect(() => {
		if (!homeId && app.homeId && !dirty) homeId = app.homeId;
	});
	const people = $derived(app.people.filter((p) => p.home_id === homeId));
	const person = $derived(people.find((p) => p.id === personId));
	const active = $derived(
		medications.filter((m) => !m.stoppedAt).sort((a, b) => a.name.localeCompare(b.name))
	);
	const stopped = $derived(
		medications.filter((m) => m.stoppedAt).sort((a, b) => a.name.localeCompare(b.name))
	);
	const slotTimes = (med: Medication) => (med.scheduledTimes ?? []).map((t) => t.slice(0, 5));
	function leaveDraft() {
		return !dirty || confirm('Discard the unsaved medication definition changes?');
	}
	function clearDraft() {
		editing = '';
		name = '';
		dose = '';
		route = '';
		times = '';
		prn = '';
		notes = '';
		controlled = false;
		schedule = '';
		unitsPerDose = '1';
		when = 'scheduled';
		dirty = false;
	}
	function resetHistory() {
		++historyVersion;
		history = [];
		historyId = '';
		historyName = '';
		historyMessage = '';
		historyLoading = false;
	}
	async function loadMedications() {
		const id = personId,
			request = ++version;
		medications = [];
		loadedPerson = '';
		message = '';
		loading = false;
		resetHistory();
		if (!id) return;
		loading = true;
		try {
			const rows = await trpc.medication.list.query({ clientId: id, includeStopped: true });
			if (request === version) {
				medications = rows;
				loadedPerson = id;
			}
		} catch {
			if (request === version)
				message =
					'Could not load medication definitions. Reconnect and retry. Lists are limited to 500 records per person.';
		} finally {
			if (request === version) loading = false;
		}
	}
	async function showHistory(med: Medication) {
		const request = ++historyVersion;
		history = [];
		historyId = med.id;
		historyName = med.name;
		historyMessage = '';
		historyLoading = false;
		if (!online) {
			historyMessage = 'Reconnect to load medication history.';
			return;
		}
		historyLoading = true;
		try {
			const rows = await trpc.medication.history.query({ medicationId: med.id });
			if (request === historyVersion) history = rows;
		} catch {
			if (request === historyVersion)
				historyMessage =
					'Could not load medication history. Reconnect and retry, or contact your agency administrator if the history exceeds 500 events.';
		} finally {
			if (request === historyVersion) historyLoading = false;
		}
	}
	function edit(med: Medication) {
		if (!leaveDraft()) return;
		editing = med.id;
		name = med.name;
		dose = med.dose ?? '';
		route = med.route ?? '';
		times = slotTimes(med).join(', ');
		prn = med.prnInstructions ?? '';
		notes = med.notes ?? '';
		controlled = med.controlled;
		schedule = med.controlledSchedule ?? '';
		unitsPerDose = String(med.unitsPerDose ?? 1);
		when = slotTimes(med).length ? 'scheduled' : 'prn';
		dirty = false;
		message = '';
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !person || (!editing && !person.active)) return;
		if (!online) {
			message = 'Reconnect to save this medication definition. Your entries are kept.';
			return;
		}
		const scheduledTimes = when === 'scheduled' ? times.split(',').map((t) => t.trim()) : [];
		if (
			when === 'scheduled' &&
			(!scheduledTimes.length ||
				scheduledTimes.length > 24 ||
				scheduledTimes.some((t) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)))
		) {
			message =
				'Enter one to 24 scheduled times as HH:mm (00:00–23:59), separated by commas. Your entries are kept.';
			return;
		}
		if (!name.trim() || (when === 'prn' && !prn.trim())) {
			message =
				'Enter medication wording and, for as-needed use, the instructions from the prescription. Your entries are kept.';
			return;
		}
		const units = Number(unitsPerDose);
		if (!(units > 0 && units <= 1000)) {
			message = 'Enter the units taken from stock per dose as a number above zero.';
			return;
		}
		busy = true;
		message = '';
		try {
			const fields = {
				controlled,
				controlledSchedule: controlled && schedule ? (schedule as ControlledSchedule) : null,
				unitsPerDose: units,
				name: name.trim(),
				dose: dose.trim() || null,
				route: route.trim() || null,
				scheduledTimes,
				prnInstructions: when === 'prn' ? prn.trim() : null,
				notes: notes.trim() || null
			};
			const row = editing
				? await trpc.medication.update.mutate({ id: editing, ...fields })
				: await trpc.medication.create.mutate({ clientId: personId, ...fields });
			medications = [...medications.filter((m) => m.id !== row.id), row];
			clearDraft();
			message =
				'Medication definition saved. Daily care forms update after sync; recorded doses are unchanged.';
			if (historyId === row.id) void showHistory(row);
		} catch {
			message =
				'Could not save the medication definition. Your entries are kept. Reconnect, check the field limits, or reload if this record was stopped elsewhere.';
		} finally {
			busy = false;
		}
	}
	async function stop(med: Medication) {
		if (busy) return;
		if (!online) {
			message = 'Reconnect before stopping a medication definition. No change has been made.';
			return;
		}
		if (
			!confirm(
				'Stop this medication definition? It will leave active daily care forms after sync and cannot be edited afterwards. Its history and recorded doses are preserved. Follow the existing authorized prescription and agency process.'
			)
		)
			return;
		if (editing === med.id && !leaveDraft()) return;
		busy = true;
		message = '';
		try {
			const row = await trpc.medication.stop.mutate({ id: med.id });
			medications = medications.map((m) => (m.id === row.id ? { ...m, ...row } : m));
			if (editing === row.id) clearDraft();
			message = 'Medication definition stopped. History and recorded doses are preserved.';
			if (historyId === row.id) void showHistory({ ...med, ...row });
		} catch {
			message =
				'Could not stop this medication definition. Reconnect and retry; the current record is kept.';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		online = navigator.onLine;
	});
	beforeNavigate(({ cancel, type }) => {
		if (type === 'leave') {
			if (dirty || busy) cancel();
			return;
		}
		if (busy || (dirty && !confirm('Leave without saving the medication definition?'))) cancel();
	});
</script>

<svelte:head><title>Manage medications · Guad</title></svelte:head>
<svelte:window
	ononline={() => (online = true)}
	onoffline={() => (online = false)}
	onbeforeunload={(e) => {
		if (dirty || busy) {
			e.preventDefault();
			e.returnValue = '';
		}
	}}
/>
<div class="stack medication-management">
	<p class="eyebrow">Medication records</p>
	<h1>Record prescription details.</h1>
	<p class="muted">
		Enter exactly what is written on the authorized prescription or pharmacy label. This records
		existing instructions; it does not recommend a medication, dose or change. Recorded medication
		administrations are never rewritten here.
	</p>
	{#if !online}<p class="callout" role="status">
			Reconnect to manage medication definitions. Draft entries stay in this open page; changes are
			not queued offline. Saved care charting remains available separately.
		</p>{/if}
	<div class="card pad grid">
		<label
			>Medication home<select
				class="input"
				value={homeId}
				disabled={busy || loading}
				onchange={(e) => {
					if (!leaveDraft()) {
						e.currentTarget.value = homeId;
						return;
					}
					homeId = e.currentTarget.value;
					personId = '';
					clearDraft();
					void loadMedications();
				}}
				>{#each app.homes as home (home.id)}<option value={home.id}>{home.name}</option
					>{/each}</select
			></label
		><label
			>Medication person<select
				class="input"
				value={personId}
				disabled={busy || loading}
				onchange={(e) => {
					if (!leaveDraft()) {
						e.currentTarget.value = personId;
						return;
					}
					personId = e.currentTarget.value;
					clearDraft();
					void loadMedications();
				}}
				><option value="">Choose a person</option>{#each people as p (p.id)}<option value={p.id}
						>{p.name}{!p.active ? ' (archived)' : ''}</option
					>{/each}</select
			></label
		>
	</div>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if loading}<p role="status">Loading medication definitions…</p>{:else if person}
		<div class="section-title">
			<h2>Active definitions · {person.name}</h2>
			<button
				class="btn sec"
				disabled={busy}
				onclick={() => {
					if (leaveDraft()) {
						clearDraft();
						void loadMedications();
					}
				}}>Reload medications</button
			>
		</div>
		{#each active as med (med.id)}<article
				class="card pad stack"
				aria-label="Active medication definition"
			>
				<h3 class="record-text">
					{med.name}{#if med.controlled}<span class="pill"
							>Controlled{med.controlledSchedule
								? ` · Schedule ${med.controlledSchedule}`
								: ''}</span
						>{/if}
				</h3>
				<p>{[med.dose, med.route].filter(Boolean).join(' · ') || 'Dose/route not recorded'}</p>
				<p>
					{slotTimes(med).length ? `Scheduled: ${slotTimes(med).join(', ')}` : 'As needed (PRN)'}
				</p>
				{#if med.prnInstructions}<p class="record-text">
						{med.prnInstructions}
					</p>{/if}{#if med.notes}<p class="muted record-text">{med.notes}</p>{/if}
				{#if med.startedAt}<p class="muted">Started {med.startedAt.toLocaleString()}.</p>{/if}
				<div class="actions">
					<button class="btn sec" disabled={busy} onclick={() => edit(med)}>Edit definition</button
					><button class="textbtn" disabled={busy} onclick={() => stop(med)}>Stop medication</button
					><button class="textbtn" disabled={busy} onclick={() => showHistory(med)}
						>View medication history</button
					>
				</div>
			</article>{:else}<p class="card empty">
				{loadedPerson === personId
					? 'No active medication definitions for this person.'
					: 'Definitions have not loaded. Reconnect and choose Reload medications.'}
			</p>{/each}
		<form
			class="card pad stack"
			aria-label="Medication definition editor"
			onsubmit={save}
			oninput={() => (dirty = true)}
		>
			<h2>{editing ? 'Edit medication definition' : 'Add a medication'}</h2>
			{#if !person.active && !editing}<p class="callout">
					Choose an active person to add a medication. Existing history remains available.
				</p>{/if}
			<label
				>Medication and strength<input
					class="input"
					required
					maxlength="200"
					bind:value={name}
					disabled={busy}
				/></label
			>
			<div class="grid">
				<label
					>Dose as written<input
						class="input"
						maxlength="200"
						bind:value={dose}
						disabled={busy}
					/></label
				><label
					>Route as written<input
						class="input"
						maxlength="100"
						bind:value={route}
						disabled={busy}
					/></label
				>
			</div>
			<label
				>When<select class="input" bind:value={when} disabled={busy}
					><option value="scheduled">Scheduled</option><option value="prn">As needed (PRN)</option
					></select
				></label
			>
			{#if when === 'scheduled'}<label
					>Scheduled times (HH:mm, comma-separated)<input
						class="input"
						maxlength="200"
						placeholder="08:00, 20:00"
						bind:value={times}
						disabled={busy}
					/></label
				>
				<p class="muted">
					One to 24 times, 00:00–23:59, using the agency’s time zone ({app.user.timeZone}).
				</p>{:else}<label
					>As-needed instructions<textarea
						class="input"
						required
						maxlength="2000"
						bind:value={prn}
						disabled={busy}></textarea></label
				>
				<p class="muted">
					Copy the authorized as-needed instructions. A PRN definition has no scheduled dose times.
				</p>{/if}
			<fieldset class="stack">
				<legend>Controlled substance</legend>
				<label class="check"
					><input type="checkbox" bind:checked={controlled} disabled={busy} /> Keep a count book for this
					medication (shift counts, witnessed receipts and waste)</label
				>
				{#if controlled}<div class="grid">
						<label
							>DEA schedule<select class="input" bind:value={schedule} disabled={busy}
								><option value="">Not recorded</option>{#each CONTROLLED_SCHEDULES as s (s)}<option
										value={s}>Schedule {s}</option
									>{/each}</select
							></label
						><label
							>Units taken from stock per dose<input
								class="input"
								type="number"
								min="0.01"
								max="1000"
								step="any"
								bind:value={unitsPerDose}
								disabled={busy}
							/></label
						>
					</div>
					<p class="muted">
						For example 1 tablet, or 5 for 5 mL. Each given dose lowers the expected count by this
						amount.
					</p>{/if}
			</fieldset>
			<label
				>Prescription notes<textarea
					class="input"
					maxlength="4000"
					bind:value={notes}
					disabled={busy}></textarea></label
			>
			<div class="actions">
				<button class="btn" disabled={busy || (!editing && !person.active)}
					>{editing ? 'Save medication changes' : 'Add medication'}</button
				><button
					class="btn sec"
					type="button"
					disabled={busy}
					onclick={() => {
						if (leaveDraft()) clearDraft();
					}}>Cancel medication changes</button
				>
			</div>
		</form>
		<details>
			<summary>Stopped medication definitions ({stopped.length})</summary>
			<div class="stack">
				{#each stopped as med (med.id)}<article
						class="card pad stack"
						aria-label="Stopped medication definition"
					>
						<h3>{med.name}</h3>
						<p>{[med.dose, med.route].filter(Boolean).join(' · ')}</p>
						<p>
							{slotTimes(med).length
								? `Scheduled: ${slotTimes(med).join(', ')}`
								: 'As needed (PRN)'}
						</p>
						{#if med.prnInstructions}<p class="record-text">{med.prnInstructions}</p>{/if}
						{#if med.notes}<p class="muted record-text">{med.notes}</p>{/if}
						<p class="muted">
							{#if med.startedAt}Started {med.startedAt.toLocaleString()}.
							{/if}Stopped {med.stoppedAt?.toLocaleString()}. This definition is read-only. Recorded
							doses remain in the care record.
						</p>
						<button class="textbtn" disabled={busy} onclick={() => showHistory(med)}
							>View medication history</button
						>
					</article>{:else}<p class="muted">No stopped definitions for this person.</p>{/each}
			</div>
		</details>
		{#if historyId}<section class="card pad stack" aria-label="Medication change history">
				<h2>History · {historyName}</h2>
				<p class="muted">
					Read-only changes to this definition. These events show who changed the record and when;
					they do not reconstruct previous prescription text. Change times use your device’s time
					zone.
				</p>
				{#if historyLoading}<p role="status">Loading change history…</p>{/if}{#if historyMessage}<p
						class="callout"
						role="status"
					>
						{historyMessage}
					</p>{/if}
				<ol>
					{#each history as event (event.id)}<li>
							<b>{event.action}</b> · {event.changedByName ?? 'System or unavailable actor'} · {event.changedAt.toLocaleString()}
						</li>{:else}<li>No change events loaded.</li>{/each}
				</ol>
			</section>{/if}
	{:else}<p class="card empty">Choose a person to load medication definitions.</p>{/if}
</div>

<style>
	.medication-management {
		max-width: 780px;
	}
	summary {
		display: list-item;
		min-height: 44px;
		padding-block: 10px;
		cursor: pointer;
	}
	article {
		overflow-wrap: anywhere;
	}
	ol {
		padding-inline-start: 24px;
	}
</style>
