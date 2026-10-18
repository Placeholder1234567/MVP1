<script lang="ts">
	// Controlled medication count rules (domain/controlled.ts): start from the
	// agency's state, then match the agency's own medication policy.
	import { untrack } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import {
		COUNT_KINDS,
		COUNT_KIND_LABELS,
		STATE_CODES,
		STATE_PRESETS,
		parseControlledRules,
		type ControlledRules,
		type StateCode
	} from '#lib/domain/index.ts';

	let { settings, onSaved }: { settings: unknown; onSaved?: () => void } = $props();
	const copy = (r: ControlledRules): ControlledRules => ({ ...r, witness: { ...r.witness } });
	// Editable copy of the rules saved when the page loaded.
	let rules = $state<ControlledRules>(copy(parseControlledRules(untrack(() => settings))));
	let saving = $state(false);
	let message = $state('');
	let error = $state('');

	function choose(state: StateCode) {
		rules = copy(STATE_PRESETS[state].rules);
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		message = '';
		error = '';
		try {
			await trpc.agency.update.mutate({ settings: { controlled_rules: $state.snapshot(rules) } });
			message = 'Saved. Devices use these rules after their next sync.';
			onSaved?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save the count rules.';
		} finally {
			saving = false;
		}
	}
</script>

<form class="card pad stack" onsubmit={save} aria-labelledby="controlled-rules-heading">
	<h2 id="controlled-rules-heading">Controlled medication counts</h2>
	<p class="muted">
		Staff keep a count book for medications marked as controlled. Start from your state, then match
		your agency’s medication policy.
	</p>
	<fieldset class="stack" disabled={saving}>
		<label
			>State<select
				class="input"
				value={rules.state}
				onchange={(e) => choose(e.currentTarget.value as StateCode)}
				>{#each STATE_CODES as code (code)}<option value={code}>{STATE_PRESETS[code].label}</option
					>{/each}</select
			></label
		>
		<p class="callout info s14">{STATE_PRESETS[rules.state].note}</p>
		<label
			>Count every<select class="input" bind:value={rules.countEvery}
				><option value="shift">Shift (when the medication keys change hands)</option><option
					value="day">Day</option
				></select
			></label
		>
		<fieldset class="stack">
			<legend>Needs a witness</legend>
			{#each COUNT_KINDS as kind (kind)}<label class="check"
					><input type="checkbox" bind:checked={rules.witness[kind]} />{kind === 'count'
						? 'Counts'
						: COUNT_KIND_LABELS[kind]}</label
				>{/each}
		</fieldset>
		<label
			>Who may witness<select class="input" bind:value={rules.witnessQualification}
				><option value="med_certified">Staff certified to give medications</option><option
					value="any_staff">Any other staff member</option
				></select
			></label
		>
		<label
			>A witness who wasn’t there countersigns within (hours)<input
				class="input"
				type="number"
				min="1"
				max="72"
				step="1"
				required
				bind:value={rules.countersignHours}
			/></label
		>
		{#if error}<p role="alert" class="callout bad">{error}</p>{/if}
		{#if message}<p role="status" class="callout">{message}</p>{/if}
		<div class="actions"><button class="btn">Save count rules</button></div>
	</fieldset>
</form>
