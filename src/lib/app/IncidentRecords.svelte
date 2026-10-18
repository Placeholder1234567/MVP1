<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { DraftData } from './care-drafts.ts';
	import { useSession } from './session.svelte';
	import {
		localTime,
		INCIDENT_LOCATIONS,
		INCIDENT_SEVERITIES,
		INCIDENT_TYPES,
		INJURY_ANSWERS,
		MEDICAL_FOLLOWUP,
		incidentNotifyRules,
		incidentOccurredAt,
		parseReportDetails,
		reportDetailsError,
		BODY_AREAS,
		RESTRAINT,
		WITH_STAFF,
		YES_NO,
		YES_NO_UNKNOWN,
		roundedClock,
		type IncidentSeverity,
		type IncidentType
	} from '#lib/domain/index.ts';
	import { dayTimeOf, insertClinical } from './clinical-write';
	let {
		clientId,
		onSaved,
		onDirty,
		onBusyChange,
		initialDraft,
		onDraft
	}: {
		clientId: string;
		onSaved?: () => void;
		onDirty?: () => void;
		onBusyChange?: (busy: boolean) => void;
		initialDraft?: DraftData | null;
		onDraft?: (data: DraftData) => void;
	} = $props();
	onDestroy(() => onBusyChange?.(false));
	const app = useSession();
	const tz = app.user.timeZone;
	const blank = () => ({
		type: 'Fall' as IncidentType,
		time: roundedClock(new Date(), tz),
		location: 'Bedroom' as string,
		description: '',
		antecedent: '',
		injured: 'No injury seen' as string,
		injuryDetail: '',
		staffAction: '',
		medical: 'None needed' as string,
		witnesses: '',
		severity: 'Low' as IncidentSeverity,
		told: [] as string[],
		// Optional state-reporting details (domain/incident-details.ts)
		withStaff: '',
		restraint: '',
		restraintDetail: '',
		selfInjury: '',
		injuryAreas: [] as string[],
		medicationFactor: '',
		environmentFactors: '',
		conditionNow: '',
		correctivePlan: ''
	});
	const details = () =>
		parseReportDetails({
			...form,
			injuryAreas: form.injured === 'Yes' ? form.injuryAreas : []
		});
	const restored = untrack(() => initialDraft);
	let form = $state(
		restored?.form ? { ...blank(), ...(restored.form as ReturnType<typeof blank>) } : blank()
	);
	let step = $state(Number(restored?.step ?? 1));
	$effect(() =>
		onDraft?.({ day: localTime(new Date(), tz).day, form: $state.snapshot(form), step })
	);
	let busy = $state(false);
	let error = $state('');
	let done = $state(false);
	let signed = $state(false);
	const rules = $derived(incidentNotifyRules(form.severity, form.type, app.incidentRules));
	const recent = $derived(app.incidents.filter((r) => r.client_id === clientId).slice(0, 3));
	function next() {
		if (step === 1) {
			if (!form.description.trim() || !incidentOccurredAt(form.time, new Date(), tz)) {
				error = 'Add the time and what happened.';
				return;
			}
		}
		if (step === 2 && !form.staffAction.trim()) {
			error = 'Add what you did.';
			return;
		}
		if (step === 2) {
			const problem = reportDetailsError(details());
			if (problem) {
				error = problem;
				return;
			}
		}
		error = '';
		onDirty?.();
		step += 1;
	}
	async function submit() {
		if (busy) return;
		if (!signed) {
			error = 'Confirm your signature before submitting this report.';
			return;
		}
		const occurred = incidentOccurredAt(form.time, new Date(), tz);
		if (!occurred || !form.description.trim() || !form.staffAction.trim()) {
			error = 'Some answers are missing. Go back and check each step.';
			return;
		}
		busy = true;
		onBusyChange?.(true);
		error = '';
		try {
			const told = form.told.filter((who) => rules.some((r) => r.who === who));
			await insertClinical(app, 'incidents', clientId, {
				type: form.type,
				severity: form.severity,
				occurred_at: occurred.toISOString(),
				location: form.location,
				description: form.description.trim(),
				antecedent: form.antecedent.trim() || null,
				injured: form.injured,
				injury_detail: form.injured === 'Yes' ? form.injuryDetail.trim() || null : null,
				staff_action: form.staffAction.trim(),
				medical_followup: form.medical,
				witnesses: form.witnesses.trim() || null,
				notified_parties: JSON.stringify(told),
				report_details: JSON.stringify(details()),
				status: 'open',
				author_id: app.user.profileId,
				author_name: app.user.name
			});
			done = true;
			onSaved?.();
		} catch {
			error = 'Could not save. Your report is still here; try again.';
		} finally {
			busy = false;
			onBusyChange?.(false);
		}
	}
</script>

{#snippet choice(
	label: string,
	options: readonly string[],
	value: string,
	set: (v: string) => void
)}
	<div class="field" role="group" aria-label={label}>
		<span class="fieldlabel">{label}</span>
		<div class="choice">
			{#each options as o (o)}<button
					type="button"
					aria-pressed={value === o}
					onclick={() => {
						signed = false;
						onDirty?.();
						set(o);
					}}>{o}</button
				>{/each}
		</div>
	</div>
{/snippet}

<fieldset class="stack care-fields" disabled={busy} aria-label="Care record editor">
	{#if done}<div class="card pad stack" role="status">
			<h2>✓ {app.labels.incident} submitted</h2>
			<p>Your supervisor will be notified after this report syncs successfully.</p>
			<p class="muted s14">
				Saving the report does not contact anyone else. Tell the people on the checklist yourself.
			</p>
			<button
				type="button"
				class="btn sec"
				onclick={() => {
					form = blank();
					step = 1;
					done = false;
					signed = false;
				}}>Report another</button
			>
		</div>
	{:else}
		<p class="callout warn s14">
			In an emergency, follow your agency’s emergency procedures first. This report does not call
			anyone.
		</p>
		<div>
			<p class="muted s14">Step {step} of 3</p>
			<div class="progress" aria-hidden="true"><span style="width:{(step / 3) * 100}%"></span></div>
		</div>
		<form
			class="card pad stack"
			novalidate
			oninput={(event) => {
				if (!(event.target instanceof HTMLInputElement && event.target.dataset.signature))
					signed = false;
			}}
			onsubmit={(e) => {
				e.preventDefault();
				if (step < 3) next();
				else void submit();
			}}
		>
			{#if step === 1}
				{@render choice('What kind of incident?', INCIDENT_TYPES, form.type, (v) => {
					form.type = v as IncidentType;
				})}
				<div class="grid2">
					<label>Time<input class="input" type="time" required bind:value={form.time} /></label
					><label
						>Where<select class="input" bind:value={form.location}
							>{#each INCIDENT_LOCATIONS as o (o)}<option>{o}</option>{/each}</select
						></label
					>
				</div>
				<label
					>What happened<textarea
						class="input"
						maxlength="8000"
						placeholder="Describe only what you saw or heard"
						bind:value={form.description}></textarea></label
				>
				<label
					>What happened right before<textarea
						class="input short"
						maxlength="4000"
						bind:value={form.antecedent}></textarea></label
				>
			{:else if step === 2}
				{@render choice('Any injury?', INJURY_ANSWERS, form.injured, (v) => (form.injured = v))}
				{#if form.injured === 'Yes'}<label
						>Describe the injury<textarea
							class="input"
							maxlength="4000"
							placeholder="Where on the body, size, color, any bleeding"
							bind:value={form.injuryDetail}></textarea></label
					>{/if}
				<label
					>What you did<textarea class="input" maxlength="4000" bind:value={form.staffAction}
					></textarea></label
				>
				{@render choice('Medical follow-up', MEDICAL_FOLLOWUP, form.medical, (v) => {
					form.medical = v;
				})}
				<label>Witnesses<input class="input" maxlength="500" bind:value={form.witnesses} /></label>
				<details class="state-details">
					<summary>Details for state reporting (optional)</summary>
					<p class="muted s13">Fill these in if your agency’s state report asks for them.</p>
					<div class="stack">
						{@render choice(
							'Was the person alone or with staff?',
							WITH_STAFF,
							form.withStaff,
							(v) => {
								form.withStaff = v;
							}
						)}
						{@render choice(
							'Restraint or restrictive intervention used?',
							RESTRAINT,
							form.restraint,
							(v) => (form.restraint = v)
						)}
						{#if form.restraint && form.restraint !== 'None'}<label
								>Describe the intervention<textarea
									class="input short"
									maxlength="2000"
									placeholder="What was used, for how long, and who did it"
									bind:value={form.restraintDetail}></textarea></label
							>{/if}
						{@render choice('Self-injurious behavior?', YES_NO, form.selfInjury, (v) => {
							form.selfInjury = v;
						})}
						{#if form.injured === 'Yes'}<div
								class="field"
								role="group"
								aria-label="Where on the body"
							>
								<span class="fieldlabel">Where on the body</span>
								<div class="areas">
									{#each BODY_AREAS as area (area)}<label class="check"
											><input type="checkbox" bind:group={form.injuryAreas} value={area} /><span
												>{area}</span
											></label
										>{/each}
								</div>
							</div>{/if}
						{@render choice(
							'Was medication a factor?',
							YES_NO_UNKNOWN,
							form.medicationFactor,
							(v) => {
								form.medicationFactor = v;
							}
						)}
						<label
							>Environmental factors<textarea
								class="input short"
								maxlength="2000"
								placeholder="Lighting, floor, noise, crowding, equipment"
								bind:value={form.environmentFactors}></textarea></label
						>
						<label
							>How the person is now<textarea
								class="input short"
								maxlength="2000"
								bind:value={form.conditionNow}></textarea></label
						>
						<label
							>Corrective action plan<textarea
								class="input short"
								maxlength="2000"
								placeholder="What will change to prevent this happening again"
								bind:value={form.correctivePlan}></textarea></label
						>
					</div>
				</details>
			{:else}
				{@render choice('How serious was it?', INCIDENT_SEVERITIES, form.severity, (v) => {
					form.severity = v as IncidentSeverity;
				})}
				<div class="field stack tight">
					<span class="fieldlabel">Who needs to be told</span>
					<p class="muted s13">
						Check anyone you’ve already told. Your agency sets who must be told and by when.
					</p>
					{#each rules as rule (rule.who)}<label class="check"
							><input type="checkbox" bind:group={form.told} value={rule.who} /><span
								>{rule.who}</span
							><span class="when">{rule.when}</span></label
						>{/each}
				</div>
			{/if}
			{#if step === 3}<label class="check"
					><input type="checkbox" data-signature="true" bind:checked={signed} /><span
						>I, {app.user.name}, confirm this report is accurate.</span
					></label
				>{/if}
			{#if error}<p class="callout bad" role="alert">{error}</p>{/if}
			<div class="actions">
				{#if step > 1}<button
						type="button"
						class="btn sec"
						onclick={() => {
							error = '';
							signed = false;
							onDirty?.();
							step -= 1;
						}}>Back</button
					>{/if}<button class="btn grow" disabled={busy || !app.db || (step === 3 && !signed)}
					>{step === 3 ? 'Sign and submit report' : 'Next'}</button
				>
			</div>
		</form>
	{/if}
	{#if recent.length}<div class="section-title"><h2>Recent reports</h2></div>
		<div class="list card">
			{#each recent as row (row.id)}<div class="row">
					<span class="grow"
						><b>{row.type}, {(row.severity ?? '').toLowerCase()} severity</b><span
							>{dayTimeOf(row.occurred_at, tz)} · {row.author_name}</span
						></span
					><span class="pill" class:bad={row.status === 'open'} class:ok={row.status !== 'open'}
						>{row.status === 'open' ? 'Open' : 'Reviewed'}</span
					>
				</div>{/each}
		</div>{/if}
</fieldset>

<style>
	.care-fields {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}

	.short {
		min-height: 70px;
	}
	.tight {
		gap: 8px;
	}
	.state-details summary {
		font-weight: 600;
		min-height: 44px;
		display: flex;
		align-items: center;
		cursor: pointer;
	}
	.areas {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 4px 12px;
	}
</style>
