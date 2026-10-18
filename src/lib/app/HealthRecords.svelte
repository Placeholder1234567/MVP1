<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { DraftData } from './care-drafts.ts';
	import { useSession, parseJson } from './session.svelte';
	import {
		localTime,
		HEALTH_FIELDS,
		HEALTH_KINDS,
		healthFlags,
		healthKindLabel,
		healthPayload,
		healthSummary,
		vitalFieldWarning,
		type HealthField,
		type HealthKind
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
	const person = $derived(app.people.find((p) => p.id === clientId));
	const restored = untrack(() => initialDraft);
	let kind = $state<HealthKind>((restored?.kind as HealthKind) ?? 'vitals');
	let fields = $state<Record<string, string | number | null>>(
		(restored?.fields as Record<string, string | number | null>) ?? {}
	);
	$effect(() =>
		onDraft?.({
			day: localTime(new Date(), app.user.timeZone).day,
			kind,
			fields: $state.snapshot(fields)
		})
	);
	$effect(() => {
		if (kind === 'bowel' && fields.status !== 'Observed' && fields.consistency) {
			fields.consistency = '';
		}
	});
	let touched = $state<Record<string, boolean>>({});
	let busy = $state(false);
	let message = $state('');
	let error = $state('');
	/** Half-width fields are paired into two-column rows (MVP .grid2). */
	const rows = $derived.by(() => {
		const out: HealthField[][] = [];
		for (const f of HEALTH_FIELDS[kind]) {
			if (kind === 'bowel' && f.key === 'consistency' && fields.status !== 'Observed') continue;
			const last = out.at(-1);
			if (f.half && last?.length === 1 && last[0].half) last.push(f);
			else out.push([f]);
		}
		return out;
	});
	const recent = $derived(app.health.filter((r) => r.client_id === clientId).slice(0, 3));
	function switchKind(next: HealthKind) {
		// charting-ux.md §4.6: switching clears the form, no confirmation.
		if (busy) return;
		onDirty?.();
		kind = next;
		fields = {};
		touched = {};
		error = '';
		message = '';
	}
	async function save() {
		if (busy) return;
		const payload = healthPayload(kind, fields);
		if (!payload.ok) {
			error = payload.error;
			return;
		}
		error = '';
		busy = true;
		onBusyChange?.(true);
		try {
			const flags = healthFlags(kind, payload.data);
			await insertClinical(app, 'health_entries', clientId, {
				kind,
				data: JSON.stringify(payload.data),
				flags: JSON.stringify(flags),
				acknowledged: 0,
				recorded_at: new Date().toISOString(),
				recorded_by: app.user.profileId
			});
			message = `${healthKindLabel(kind)} saved for ${person?.first_name || person?.name || 'this person'}.${
				flags.length ? ' Your supervisor will be alerted to the out-of-range reading.' : ''
			}`;
			fields = {};
			touched = {};
			onSaved?.();
		} catch {
			error = 'Could not save. Your entries are still here; try again.';
		} finally {
			busy = false;
			onBusyChange?.(false);
		}
	}
</script>

{#snippet input(f: HealthField)}
	{@const warning =
		kind === 'vitals' && touched[f.key] ? vitalFieldWarning(f.key, fields[f.key]) : null}
	<div class="field">
		<label class="fieldlabel" for="h-{f.key}">{f.label}</label>
		{#if f.input === 'textarea'}<textarea
				class="input"
				id="h-{f.key}"
				maxlength="1000"
				placeholder={f.placeholder}
				bind:value={fields[f.key]}></textarea>
		{:else if f.input === 'select'}<select
				class="input"
				id="h-{f.key}"
				bind:value={fields[f.key]}
				style="margin-top:6px"
				><option value="">Choose an option</option>{#each f.options ?? [] as o (o)}<option
						>{o}</option
					>{/each}</select
			>
		{:else if f.input === 'number'}<div class="unit">
				<input
					class="input"
					class:flagged={!!warning}
					id="h-{f.key}"
					type="number"
					step={f.decimal ? '0.1' : '1'}
					inputmode={f.decimal ? 'decimal' : 'numeric'}
					aria-describedby={warning
						? `h-${f.key}-warn`
						: f.alertConfigured === false
							? `h-${f.key}-limits`
							: undefined}
					bind:value={fields[f.key]}
					onblur={() => (touched[f.key] = true)}
				/><em>{f.unit}</em>
			</div>
			{#if warning}<p class="field-warn" id="h-{f.key}-warn">{warning}</p>{/if}
		{:else}<input
				class="input"
				id="h-{f.key}"
				type={f.input}
				maxlength="1000"
				placeholder={f.placeholder}
				bind:value={fields[f.key]}
				style="margin-top:6px"
			/>{/if}
		{#if f.alertConfigured === false}<p class="muted s13" id="h-{f.key}-limits">
				No alert limits configured; follow the care plan
			</p>{/if}
	</div>
{/snippet}

<fieldset class="stack care-fields" disabled={busy} aria-label="Care record editor">
	<div class="seg" role="group" aria-label="What are you recording?">
		{#each HEALTH_KINDS as k (k.key)}<button
				type="button"
				aria-pressed={kind === k.key}
				onclick={() => switchKind(k.key)}>{k.label}</button
			>{/each}
	</div>
	<form
		class="card pad stack"
		novalidate
		onsubmit={(event) => {
			event.preventDefault();
			void save();
		}}
	>
		{#each rows as row, i (`${kind}:${i}`)}{#if row.length === 2}<div class="grid2">
					{@render input(row[0])}{@render input(row[1])}
				</div>{:else}{@render input(row[0])}{/if}{/each}
		{#if error}<p class="callout bad" role="alert">{error}</p>{/if}
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		<button class="btn full" disabled={busy || !app.db}
			>Save {healthKindLabel(kind).toLowerCase()}</button
		>
	</form>
	{#if recent.length}<div class="section-title"><h2>Recent</h2></div>
		<div class="list card">
			{#each recent as row (row.id)}{@const flagged = parseJson<string[]>(row.flags, []).length > 0}
				<div class="row">
					<span class="grow"
						><b>{healthKindLabel(row.kind)} · {dayTimeOf(row.recorded_at, app.user.timeZone)}</b
						><span>{healthSummary(row.kind, parseJson<Record<string, unknown>>(row.data, {}))}</span
						></span
					>{#if flagged}<span class="pill bad"
							>{row.acknowledged ? 'Alert · followed up' : 'Alert'}</span
						>{/if}
				</div>{/each}
		</div>{/if}
	<p class="muted s13">
		Alerts use placeholder limits (temperature 95–100.4°F, pulse 50–100, blood pressure 90–140 /
		60–90). Follow the person’s care plan and your agency’s procedures.
	</p>
</fieldset>

<style>
	.care-fields {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
</style>
