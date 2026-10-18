<script lang="ts">
	// Controlled medication count book for the current home (domain/controlled.ts):
	// shift counts, receipts, waste and disposal, each with a witness when the
	// agency's rules ask for one. Entries save on the device and upload later;
	// a witness who wasn't at this device countersigns from their own.
	import { resolve } from '$app/paths';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { canReachServer, dayTimeOf } from '#lib/app/clinical-write.ts';
	import { insertCountEntry, medicationLedger } from '#lib/app/controlled-write.ts';
	import { WitnessSignIn } from '#lib/auth/witness.ts';
	import { onDestroy } from 'svelte';
	import {
		COUNT_KINDS,
		COUNT_KIND_LABELS,
		DISPOSAL_METHODS,
		WASTE_REASONS,
		canWitness,
		countDue,
		countEntryError,
		countersignOverdue,
		type CountKind
	} from '#lib/domain/index.ts';
	const app = useSession();
	const tz = $derived(app.user.timeZone);
	const rules = $derived(app.controlledRules);
	let now = $state(new Date());
	$effect(() => {
		const tick = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(tick);
	});

	const meds = $derived(
		app.medications
			.filter((m) => Number(m.controlled) && m.home_id === app.homeId)
			.map((m) => {
				const ledger = medicationLedger(app, m.id);
				return {
					med: m,
					person: app.people.find((p) => p.id === m.client_id),
					...ledger,
					due: !m.stopped_at && countDue(ledger.entries, now, tz, rules),
					lastEntry: ledger.entries.at(-1)
				};
			})
			// Stopped medications stay while there is stock left to dispose of.
			.filter((x) => !x.med.stopped_at || x.expected > 0)
			.sort((a, b) =>
				`${a.person?.name}${a.med.name}`.localeCompare(`${b.person?.name}${b.med.name}`)
			)
	);
	const toSign = $derived(
		app.controlledCounts.filter(
			(c) => c.witness_id === app.user.profileId && c.witness_status === 'pending'
		)
	);
	const medName = (id: string | null) =>
		app.medications.find((m) => m.id === id)?.name ?? 'Medication';
	const personName = (id: string | null) => app.people.find((p) => p.id === id)?.name ?? 'Person';

	// One entry form open at a time.
	let open = $state<{ medicationId: string; kind: CountKind } | null>(null);
	// A number input binds as a number, or null while empty.
	let quantity = $state<number | null>(null);
	let reason = $state('');
	let witnessId = $state('');
	// The witness signs in on this device (online), or confirms later on theirs.
	let witnessHere = $state(true);
	let witnessPassword = $state('');
	let witnessCode = $state('');
	let needCode = $state(false);
	const witnessSignIn = new WitnessSignIn();
	onDestroy(() => void witnessSignIn.dispose());
	let busy = $state(false);
	let error = $state('');
	let message = $state('');
	let incidentFor = $state<string | null>(null);

	const witnesses = $derived.by(() => {
		const med = app.medications.find((m) => m.id === open?.medicationId);
		if (!med?.home_id) return [];
		return app.staff.filter(
			(s) =>
				canWitness(rules, s, app.user.profileId) &&
				(s.role !== 'caregiver' || parseJson<string[]>(s.home_ids, []).includes(med.home_id!))
		);
	});
	function start(medicationId: string, kind: CountKind) {
		open = { medicationId, kind };
		quantity = null;
		reason = '';
		witnessId = '';
		witnessHere = canReachServer(app);
		forgetWitness();
		error = '';
		message = '';
		incidentFor = null;
	}
	function forgetWitness() {
		witnessPassword = '';
		witnessCode = '';
		needCode = false;
		void witnessSignIn.dispose();
	}
	const witnessEmail = $derived(app.staff.find((s) => s.id === witnessId)?.email ?? '');
	/** Signs the witness in on this device; null while their authenticator code is needed. */
	async function witnessToken(): Promise<string | null> {
		if (needCode) {
			if (!/^\d{6}$/.test(witnessCode.trim())) throw new Error('Enter the 6-digit code.');
			return (await witnessSignIn.finish(witnessCode.trim())).token;
		}
		if (!witnessEmail || !witnessPassword)
			throw new Error('The witness enters their password, or chooses to confirm later.');
		const r = await witnessSignIn.start(witnessEmail, witnessPassword);
		witnessPassword = '';
		if (r === 'code') {
			needCode = true;
			return null;
		}
		return r.token;
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!open || busy) return;
		const kind = open.kind;
		const amount = quantity ?? Number.NaN;
		const problem = countEntryError({
			kind,
			quantity: amount,
			reason,
			needsWitness: rules.witness[kind],
			witnessId: witnessId || null
		});
		if (problem) {
			error = problem;
			return;
		}
		const inPerson = !!witnessId && witnessHere;
		if (inPerson && !canReachServer(app)) {
			error =
				'Signing in a witness needs a connection. Choose “Confirms later” to save it on this device.';
			return;
		}
		busy = true;
		error = '';
		try {
			const medicationId = open.medicationId;
			let r: { discrepancy: boolean; expected: number | null };
			if (inPerson) {
				let token: string | null;
				try {
					token = await witnessToken();
				} catch (e) {
					error = e instanceof Error ? e.message : 'The witness sign-in didn’t work.';
					return;
				}
				if (!token) {
					error = '';
					return;
				}
				r = await trpc.medication.countEntry.mutate({
					id: crypto.randomUUID(),
					medicationId,
					kind,
					quantity: amount,
					reason: reason.trim() || null,
					witnessId,
					witnessToken: token
				});
				forgetWitness();
			} else {
				r = await insertCountEntry(app, medicationId, {
					kind,
					quantity: amount,
					reason: reason.trim() || null,
					witnessId: witnessId || null
				});
			}
			const med = app.medications.find((m) => m.id === medicationId);
			open = null;
			if (r.discrepancy) {
				incidentFor = med?.client_id ?? null;
				message = `Counted ${amount}, but ${r.expected} should be on hand. Your supervisor has been alerted. Recount with your witness, then report it as a medication error incident.`;
			} else {
				message = inPerson
					? 'Saved and witnessed.'
					: witnessId
						? 'Saved. Your witness confirms it from their own device.'
						: 'Saved to the count book.';
			}
		} catch (e) {
			error =
				e instanceof Error && e.message.startsWith('The witness')
					? e.message
					: 'Could not save this entry. Your entries are still here.';
		} finally {
			busy = false;
		}
	}
	let signing = $state('');
	async function countersign(id: string) {
		if (signing) return;
		if (!canReachServer(app)) {
			message = 'Reconnect and let changes finish syncing to countersign.';
			return;
		}
		signing = id;
		message = '';
		try {
			await trpc.medication.countersign.mutate({ id });
			message = 'Countersigned. Thank you.';
		} catch {
			message = 'Could not countersign. It may already be signed; refresh and try again.';
		} finally {
			signing = '';
		}
	}
	const reasons = $derived(
		open?.kind === 'waste' ? WASTE_REASONS : open?.kind === 'disposal' ? DISPOSAL_METHODS : []
	);
	const describe = (c: (typeof app.controlledCounts)[number]) =>
		`${COUNT_KIND_LABELS[c.kind as CountKind] ?? c.kind}: ${c.quantity}${c.kind === 'count' && c.expected !== null && Number(c.discrepancy) ? ` (expected ${c.expected})` : ''}`;
	const witnessText = (c: (typeof app.controlledCounts)[number]) =>
		c.witness_status === 'verified'
			? `witnessed by ${c.witness_name}`
			: c.witness_status === 'pending'
				? `waiting for ${c.witness_name} to countersign${countersignOverdue(c, rules, now) ? ' (overdue)' : ''}`
				: 'no witness';
</script>

<svelte:head><title>Controlled medications · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Count book</p>
	<h1>Controlled medications</h1>
	<p class="muted">
		Count each one with a witness {rules.countEvery === 'shift' ? 'every shift' : 'every day'}.
		Given doses lower the expected count automatically.
	</p>
	{#if message}<div class="callout" class:bad={!!incidentFor} role="status">
			<p>{message}</p>
			{#if incidentFor}<a
					class="btn sec"
					href={resolve('/(app)/people/[id]/incident', { id: incidentFor })}>Report an incident</a
				>{/if}
		</div>{/if}

	{#if toSign.length}<section class="card pad stack" aria-labelledby="countersign-heading">
			<h2 id="countersign-heading">Waiting for your countersignature</h2>
			<p class="muted">
				Only countersign what you saw. If something isn’t right, don’t sign: tell your supervisor.
			</p>
			{#each toSign as c (c.id)}<div class="row">
					<span class="grow"
						><b>{medName(c.medication_id)}</b> · {personName(c.client_id)}<span
							>{describe(c)} · recorded by {c.recorded_by_name}, {dayTimeOf(
								c.recorded_at,
								tz
							)}</span
						></span
					><button class="btn sec" disabled={!!signing} onclick={() => countersign(c.id)}
						>Countersign</button
					>
				</div>{/each}
		</section>{/if}

	{#each meds as x (x.med.id)}<article
			class="card pad stack"
			aria-label={`${x.med.name} for ${x.person?.name ?? 'person'}`}
		>
			<div class="spread">
				<div>
					<h2 class="record-text">{x.med.name}</h2>
					<p class="muted">
						{x.person?.name ?? 'Person'}{x.med.controlled_schedule
							? ` · Schedule ${x.med.controlled_schedule}`
							: ''}{x.med.stopped_at ? ' · stopped' : ''}
					</p>
				</div>
				{#if x.due}<span class="pill due">Count due</span>{/if}
			</div>
			<p>
				{#if open?.medicationId === x.med.id && open.kind === 'count'}<b
						>On hand: hidden while you count</b
					>{:else}<b>On hand: {x.expected}</b>{/if}
				<span class="muted"
					>{x.lastCount
						? ` · last counted ${dayTimeOf(x.lastCount, tz)}`
						: ' · not counted yet'}</span
				>
			</p>
			{#if x.lastEntry?.kind === 'count' && Number(x.lastEntry.discrepancy)}<p
					class="callout bad"
					role="alert"
				>
					The last count ({x.lastEntry.quantity}) didn’t match the {x.lastEntry.expected} expected. Your
					supervisor has been alerted.
				</p>{/if}
			<div class="actions">
				{#each COUNT_KINDS as kind (kind)}{#if !x.med.stopped_at || kind === 'count' || kind === 'disposal'}<button
							class={kind === 'count' ? 'btn' : 'btn sec'}
							aria-pressed={open?.medicationId === x.med.id && open.kind === kind}
							onclick={() => start(x.med.id, kind)}
							>{kind === 'count' ? 'Count' : COUNT_KIND_LABELS[kind]}</button
						>{/if}{/each}
			</div>
			{#if open?.medicationId === x.med.id}<form
					class="stack entry"
					onsubmit={save}
					aria-label={`${COUNT_KIND_LABELS[open.kind]}: ${x.med.name}`}
				>
					<label
						>{open.kind === 'count'
							? 'How many are on hand?'
							: open.kind === 'receipt'
								? 'How many were received?'
								: open.kind === 'waste'
									? 'How many were wasted?'
									: 'How many were disposed of?'}<input
							class="input"
							type="number"
							inputmode="decimal"
							min="0"
							step="any"
							required
							bind:value={quantity}
						/></label
					>
					{#if open.kind === 'count'}<p class="muted">
							The expected number stays hidden until you save, so the count is independent.
						</p>{/if}
					{#if reasons.length}<label
							>{open.kind === 'waste' ? 'Why' : 'How'}<select
								class="input"
								required
								bind:value={reason}
								><option value="">Choose…</option>{#each reasons as r (r)}<option value={r}
										>{r}</option
									>{/each}</select
							></label
						>{/if}
					<label
						>Witness{rules.witness[open.kind] ? '' : ' (optional)'}<select
							class="input"
							bind:value={witnessId}
							><option value="">Choose who watched…</option>{#each witnesses as w (w.id)}<option
									value={w.id}>{w.name}</option
								>{/each}</select
						></label
					>
					{#if witnessId}<fieldset class="stack">
							<legend>How {app.staff.find((s) => s.id === witnessId)?.name} signs</legend>
							<label class="check"
								><input
									type="radio"
									name="witness-how"
									value={true}
									bind:group={witnessHere}
									onchange={forgetWitness}
								/> Signs in here now</label
							><label class="check"
								><input
									type="radio"
									name="witness-how"
									value={false}
									bind:group={witnessHere}
									onchange={forgetWitness}
								/>
								Confirms later on their own device (within {rules.countersignHours} hours)</label
							>
						</fieldset>
						{#if witnessHere}{#if needCode}<label
									>Code from the witness’s authenticator app<input
										class="input"
										inputmode="numeric"
										autocomplete="one-time-code"
										maxlength="6"
										bind:value={witnessCode}
									/></label
								>{:else}<label
									>Witness password ({witnessEmail})<input
										class="input"
										type="password"
										autocomplete="off"
										bind:value={witnessPassword}
									/></label
								>{/if}
							<p class="muted">
								Hand the device to your witness. Their sign-in is used once to confirm this entry
								and is not kept.
							</p>{/if}{/if}
					{#if error}<p class="callout bad" role="alert">{error}</p>{/if}
					<div class="actions">
						<button class="btn" disabled={busy}>Save to count book</button><button
							class="btn sec"
							type="button"
							onclick={() => (open = null)}>Cancel</button
						>
					</div>
				</form>{/if}
			<details>
				<summary>Count book ({x.entries.length})</summary>
				<ol class="history">
					{#each x.entries.toReversed() as c (c.id)}<li>
							<b>{describe(c)}</b>{c.reason ? ` · ${c.reason}` : ''}
							<span class="muted"
								>· {c.recorded_by_name}, {dayTimeOf(c.recorded_at, tz)} · {witnessText(c)}</span
							>
						</li>{:else}<li class="muted">No entries yet.</li>{/each}
				</ol>
			</details>
		</article>{:else}<p class="card empty">
			No controlled medications at this home. Supervisors mark a medication as controlled in
			Medications.
		</p>{/each}
</div>

<style>
	.entry {
		border-top: 1px solid var(--line2);
		padding-top: 12px;
	}
	.history {
		margin: 8px 0 0;
		padding-left: 18px;
		display: grid;
		gap: 6px;
	}
	details summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
</style>
