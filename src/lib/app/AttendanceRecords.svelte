<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { DraftData } from './care-drafts.ts';
	import { useSession, parseJson } from './session.svelte';
	import { ATTENDANCE_SERVICES, localTime } from '#lib/domain/index.ts';
	import { insertClinical, timeOf } from './clinical-write';
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
	const day = localTime(new Date(), app.user.timeZone).day;
	// Until the next sync there can be more than one row for the day: each
	// save adds one and the server merges them into the day's record.
	const today = $derived(app.attendance.filter((r) => r.client_id === clientId && r.day === day));
	const saved = $derived(today[0]);
	const recorded = $derived([
		...new Set(today.flatMap((r) => parseJson<string[]>(r.services, [])))
	]);
	const restored = untrack(() => initialDraft);
	let services = $state<string[]>((restored?.services as string[]) ?? []);
	$effect(() => onDraft?.({ day, services: $state.snapshot(services) }));
	let busy = $state(false);
	let message = $state('');
	let error = $state('');
	async function save() {
		if (busy || app.privacyLocked || !app.db) return;
		if (!services.length) {
			error = 'Check at least one service.';
			return;
		}
		busy = true;
		onBusyChange?.(true);
		error = '';
		try {
			// Always a new row, never an edit: the server merges every row for the
			// person and day into one record and never removes a service. An edit
			// (PATCH) names only this device's row, which the server may have
			// merged into another device's record, so it would be refused.
			const union = [...new Set([...recorded, ...services])];
			const now = new Date().toISOString();
			await insertClinical(app, 'attendance', clientId, {
				day,
				services: JSON.stringify(union),
				recorded_at: now,
				recorded_by: app.user.profileId,
				recorded_by_name: app.user.name
			});
			services = [];
			message = 'Attendance saved.';
			onSaved?.();
		} catch {
			error = 'Could not save. Your selections are still here.';
		} finally {
			busy = false;
			onBusyChange?.(false);
		}
	}
</script>

<fieldset class="stack care-fields" disabled={busy} aria-label="Care record editor">
	<p>
		Which services did {person?.first_name || person?.name || 'this person'} get today?
		{#if saved}<span class="muted s14"
				>Saved by {saved.recorded_by_name ?? 'staff'} at {timeOf(
					saved.recorded_at,
					app.user.timeZone
				)}.</span
			>{/if}
	</p>
	<form
		class="card pad stack tight"
		onsubmit={(e) => {
			e.preventDefault();
			void save();
		}}
	>
		{#each ATTENDANCE_SERVICES as service (service)}{#if recorded.includes(service)}<label
					class="check"
					><input type="checkbox" checked disabled /><span>{service}</span><span class="when"
						>Saved</span
					></label
				>{:else}<label class="check"
					><input
						type="checkbox"
						onchange={() => onDirty?.()}
						bind:group={services}
						value={service}
					/><span>{service}</span></label
				>{/if}{/each}
		<p class="muted s13">
			Saved services can’t be removed here. Ask your supervisor to correct them.
		</p>
		{#if error}<p class="callout bad" role="alert">{error}</p>{/if}
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		<button class="btn full" disabled={busy || !app.db}>Save attendance</button>
	</form>
</fieldset>

<style>
	.care-fields {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}

	.tight {
		gap: 10px;
	}
</style>
