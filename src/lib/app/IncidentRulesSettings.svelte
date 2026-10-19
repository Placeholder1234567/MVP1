<script lang="ts">
	// Who must be told about which incidents, and by when (frontend-audit.md
	// finding 8). Caregivers see these in the incident wizard and supervisors
	// in the attention queue. Enter your state's actual rules; the defaults
	// are placeholders.
	import { untrack } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import {
		ABUSE_HOTLINE_MAX,
		DEFAULT_INCIDENT_RULES,
		INCIDENT_TYPES,
		RULE_HOURS_MAX,
		RULE_WHEN_MAX,
		parseIncidentRules,
		type IncidentRules,
		type IncidentSeverity
	} from '#lib/domain/index.ts';

	let { settings, onSaved }: { settings: unknown; onSaved?: () => void } = $props();
	const SEVERITIES: IncidentSeverity[] = ['Low', 'Medium', 'High'];
	const copy = (r: IncidentRules): IncidentRules => ({
		...r,
		nurseTypes: [...r.nurseTypes],
		stateSeverities: [...r.stateSeverities],
		stateTypes: [...r.stateTypes]
	});
	// Editable copy of the rules saved when the page loaded.
	let rules = $state<IncidentRules>(copy(parseIncidentRules(untrack(() => settings))));
	let saving = $state(false);
	let message = $state('');
	let error = $state('');

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		message = '';
		error = '';
		try {
			await trpc.agency.update.mutate({ settings: { incident_rules: $state.snapshot(rules) } });
			message = 'Incident rules saved. Devices pick them up on their next sync.';
			onSaved?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save the incident rules.';
		} finally {
			saving = false;
		}
	}
</script>

<form class="card pad stack" onsubmit={save} aria-labelledby="incident-rules-heading">
	<h2 id="incident-rules-heading">Incident reporting rules</h2>
	<p class="muted">
		Who staff must tell after an incident, and by when. The supervisor is always told right away.
		Replace the defaults with your state's rules.
	</p>
	<fieldset class="stack" disabled={saving}>
		<label
			>Family or guardian: deadline<input
				class="input"
				required
				maxlength={RULE_WHEN_MAX}
				bind:value={rules.guardianWhen}
			/></label
		>
		<label
			>Remind supervisors if family or guardian isn’t marked as told after (hours, blank for no
			reminder)<input
				class="input"
				type="number"
				min="1"
				max={RULE_HOURS_MAX}
				step="1"
				bind:value={rules.guardianHours}
			/></label
		>
		<fieldset class="stack">
			<legend>Nurse: for these incidents</legend>
			<div class="types">
				{#each INCIDENT_TYPES as t (t)}<label class="check"
						><input type="checkbox" value={t} bind:group={rules.nurseTypes} />{t}</label
					>{/each}
			</div>
			<label
				>Nurse: deadline<input
					class="input"
					required
					maxlength={RULE_WHEN_MAX}
					bind:value={rules.nurseWhen}
				/></label
			>
			<label
				>Remind supervisors if the nurse isn’t marked as told after (hours, blank for no reminder)<input
					class="input"
					type="number"
					min="1"
					max={RULE_HOURS_MAX}
					step="1"
					bind:value={rules.nurseHours}
				/></label
			>
		</fieldset>
		<fieldset class="stack">
			<legend>State reporting system: for these severities</legend>
			<div class="types">
				{#each SEVERITIES as s (s)}<label class="check"
						><input type="checkbox" value={s} bind:group={rules.stateSeverities} />{s}</label
					>{/each}
			</div>
			<p class="fieldlabel" id="state-types">…and these incident types, whatever the severity</p>
			<div class="types" role="group" aria-labelledby="state-types">
				{#each INCIDENT_TYPES as t (t)}<label class="check"
						><input type="checkbox" value={t} bind:group={rules.stateTypes} />{t}</label
					>{/each}
			</div>
			<label
				>State reporting: deadline<input
					class="input"
					required
					maxlength={RULE_WHEN_MAX}
					bind:value={rules.stateWhen}
				/></label
			>
			<label
				>Remind supervisors if the state isn’t marked as told after (hours, blank for no reminder)<input
					class="input"
					type="number"
					min="1"
					max={RULE_HOURS_MAX}
					step="1"
					bind:value={rules.stateHours}
				/></label
			>
		</fieldset>
		<label
			>Abuse, neglect and exploitation hotline (shown to staff with those incident types, e.g. your
			state's APS number)<input
				class="input"
				maxlength={ABUSE_HOTLINE_MAX}
				placeholder="e.g. Adult Protective Services 1-800-…"
				bind:value={rules.abuseHotline}
			/></label
		>
		{#if error}<p role="alert" class="callout bad">{error}</p>{/if}
		{#if message}<p role="status" class="callout">{message}</p>{/if}
		<div class="actions">
			<button class="btn">Save incident rules</button>
			<button type="button" class="btn sec" onclick={() => (rules = copy(DEFAULT_INCIDENT_RULES))}
				>Restore defaults</button
			>
		</div>
	</fieldset>
</form>

<style>
	.types {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 4px 12px;
	}
</style>
