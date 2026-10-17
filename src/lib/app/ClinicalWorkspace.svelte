<script lang="ts" module>
	export type CareSection = 'medications' | 'health' | 'incident' | 'attendance';
</script>

<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from './session.svelte';
	import MedicationRecords from './MedicationRecords.svelte';
	import HealthRecords from './HealthRecords.svelte';
	import IncidentRecords from './IncidentRecords.svelte';
	import AttendanceRecords from './AttendanceRecords.svelte';
	let {
		clientId,
		section,
		onBack
	}: {
		clientId: string;
		/** One screen (online routes); without it, tabs switch between all four (offline workspace) */
		section?: CareSection;
		onBack?: () => void;
	} = $props();
	const app = useSession();
	const person = $derived(app.people.find((p) => p.id === clientId && p.active));
	const home = $derived(app.homes.find((h) => h.id === person?.home_id));
	let tab = $state<CareSection>('medications');
	const current = $derived(section ?? tab);
	let dirty = $state(false);
	let busy = $state(false);
	const changed = () => (dirty = true);
	const busyChanged = (value: boolean) => (busy = value);
	const labels = $derived({
		medications: app.labels.medications,
		health: 'Health',
		incident: app.labels.incident,
		attendance: 'Attendance'
	} satisfies Record<CareSection, string>);
	function leave() {
		return !busy && (!dirty || confirm('Discard the unsaved changes in this form?'));
	}
	const saved = () => (dirty = false);
	beforeNavigate(({ cancel, type }) => {
		if (type === 'leave') {
			if (dirty || busy) cancel();
		} else if (!leave()) cancel();
	});
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty || busy) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
<div class="stack care-screen">
	{#if onBack}<button
			class="textbtn"
			disabled={busy}
			onclick={() => {
				if (leave()) onBack();
			}}>← Saved records</button
		>{/if}
	{#if person}<div>
			<h1>{labels[current]}</h1>
			<p class="muted">{person.name}{home ? ` · ${home.name}` : ''}</p>
		</div>
		{#if !section}<div class="seg" role="group" aria-label="Care record sections">
				{#each Object.entries(labels) as [key, label] (key)}<button
						type="button"
						aria-pressed={tab === key}
						disabled={busy}
						onclick={() => {
							if (tab === key) return;
							if (leave()) {
								tab = key as CareSection;
								dirty = false;
							}
						}}>{label}</button
					>{/each}
			</div>{/if}
		<p class="muted s13" role="status">
			{app.status}{app.pending ? ` · ${app.pending} changes waiting to sync` : ''}
		</p>
		{#if busy}<p role="status">Saving this record. Please wait before leaving.</p>{/if}
		<div
			class="stack"
			oninput={() => (dirty = true)}
			role="group"
			aria-label="{labels[current]} form"
		>
			{#key `${clientId}:${current}`}{#if current === 'medications'}<MedicationRecords
						{clientId}
						onSaved={saved}
						onDirty={changed}
						onBusyChange={busyChanged}
					/>{:else if current === 'health'}<HealthRecords
						{clientId}
						onSaved={saved}
						onDirty={changed}
						onBusyChange={busyChanged}
					/>{:else if current === 'incident'}<IncidentRecords
						{clientId}
						onSaved={saved}
						onDirty={changed}
						onBusyChange={busyChanged}
					/>{:else}<AttendanceRecords
						{clientId}
						onSaved={saved}
						onDirty={changed}
						onBusyChange={busyChanged}
					/>{/if}{/key}
		</div>
	{:else}<p class="card empty">
			This person’s record is not available on your device. Check your selected home or wait for
			sync.
		</p>{/if}
</div>

<style>
	.care-screen {
		max-width: 720px;
	}
</style>
