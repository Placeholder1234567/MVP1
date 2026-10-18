<script lang="ts" module>
	export type CareSection = 'medications' | 'health' | 'incident' | 'attendance';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import {
		CareDraftStore,
		canResumeCareDraft,
		type DraftData,
		type DraftSection
	} from './care-drafts.ts';
	import { localTime } from '#lib/domain/index.ts';
	import { beforeNavigate, goto } from '$app/navigation';
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
	let draftStore = $state.raw<CareDraftStore>();
	let recovery = $state<DraftData | null>(null);
	let initialDraft = $state<DraftData | null>(null);
	let draftReady = $state(false);
	let draftError = $state(false);
	let draftAction = $state(false);
	let cleanupNeeded = $state(false);
	let draftSaved = $state(false);
	let generation = $state(0);
	let latestDraft = $state.raw<DraftData | null>(null);
	let latestScope = $state('');
	const olderDay = $derived(
		recovery &&
			current !== 'medications' &&
			!canResumeCareDraft(current, recovery, localTime(new Date(), app.user.timeZone).day)
	);
	$effect(() => {
		const section = current;
		const personId = clientId;
		const profileId = app.user.profileId;
		const db = app.ready ? app.db : undefined;
		const scope = `${profileId}:${personId}:${section}`;
		const preserved = untrack(() => (dirty && latestScope === scope ? latestDraft : null));
		let alive = true;
		recovery = null;
		initialDraft = preserved;
		draftReady = section === 'medications' || !!preserved;
		cleanupNeeded = false;
		draftError = false;
		draftSaved = false;
		if (section === 'medications' || !db) {
			draftStore = undefined;
			return;
		}
		const store = new CareDraftStore(
			() => db,
			profileId,
			personId,
			section as DraftSection,
			(error) => {
				if (alive) {
					draftError = error;
					draftSaved = !error;
					if (!error) cleanupNeeded = false;
				}
			}
		);
		draftStore = store;
		untrack(() => generation++);
		if (preserved) store.queue(preserved);
		else
			void store
				.load()
				.then((data) => {
					if (alive) recovery = data;
				})
				.catch(() => {
					if (alive) draftError = true;
				})
				.finally(() => {
					if (alive) draftReady = true;
				});
		return () => {
			alive = false;
			store.dispose();
		};
	});
	function draftChanged(data: DraftData) {
		if (!dirty) return;
		latestDraft = data;
		latestScope = `${app.user.profileId}:${clientId}:${current}`;
		draftSaved = false;
		draftStore?.queue(data);
	}
	async function discardDraft() {
		if (busy || draftAction) return false;
		draftError = false;
		draftAction = true;
		await draftStore?.clear();
		draftAction = false;
		if (draftError) return false;
		dirty = false;
		latestDraft = null;
		recovery = null;
		initialDraft = null;
		draftSaved = false;
		generation++;
		return true;
	}
	async function retryDraft() {
		await draftStore?.flush();
		if (!dirty) {
			try {
				recovery = (await draftStore?.load()) ?? null;
				draftError = false;
			} catch {
				draftError = true;
			}
		}
	}
	function resumeDraft() {
		initialDraft = recovery;
		recovery = null;
		dirty = true;
		generation++;
	}
	const changed = () => (dirty = true);
	const busyChanged = (value: boolean) => (busy = value);
	const labels = $derived({
		medications: app.labels.medications,
		health: 'Health',
		incident: app.labels.incident,
		attendance: 'Attendance'
	} satisfies Record<CareSection, string>);
	async function leave() {
		if (busy || draftAction) return false;
		if (!dirty) return true;
		return confirm('Discard the unsaved changes in this form?') && (await discardDraft());
	}
	const saved = () => {
		latestDraft = null;
		cleanupNeeded = current !== 'medications';
		dirty = false;
		void draftStore?.clear();
		draftSaved = false;
	};
	beforeNavigate(({ cancel, type, to }) => {
		if (type === 'leave') {
			if (dirty || busy || draftAction) {
				void draftStore?.flush();
				cancel();
			}
		} else if (dirty || busy || draftAction) {
			cancel();
			void leave().then((allowed) => {
				if (allowed && to) {
					// SvelteKit already resolved this intercepted navigation URL.
					// eslint-disable-next-line svelte/no-navigation-without-resolve
					void goto(to.url);
				}
			});
		}
	});
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty || busy || draftAction) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>
<div class="stack care-screen">
	{#if onBack}<button
			class="textbtn"
			disabled={busy || draftAction}
			onclick={async () => {
				if (await leave()) onBack();
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
						disabled={busy || draftAction}
						onclick={async () => {
							if (tab === key) return;
							if (await leave()) {
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
			inert={draftAction}
			oninput={() => (dirty = true)}
			role="group"
			aria-label="{labels[current]} form"
		>
			{#if draftError}<p class="callout bad" role="alert">
					{#if cleanupNeeded}Record saved, but recovery draft could not be cleared. Check saved
						records before resuming later.{:else}Could not save or read this device’s recovery
						draft. Your current entries are still here. Keep this form open and try again before
						closing.{/if}
				</p>
				<button class="btn sec" onclick={() => void retryDraft()}>Retry recovery storage</button
				>{/if}
			{#if !draftReady}<p role="status">Checking for a saved draft…</p>
			{:else if recovery}<section class="card pad stack" aria-label="Recover unfinished care form">
					<h2>Unfinished form saved on this device</h2>
					<p>
						Unfinished answers saved for {recovery.day}. A previous save may already exist; check
						saved records before continuing. Review every answer and confirm any signature again.
					</p>
					{#if olderDay}<p>
							This incident or attendance draft is from another day. Its facts are shown below for
							reference; it cannot be recorded as today’s entry.
						</p>
						<dl>
							{#each Object.entries((recovery.form as Record<string, unknown>) ?? { services: recovery.services }) as [key, value] (key)}<dt
								>
									{(
										{
											type: 'Incident type',
											time: 'Time',
											location: 'Location',
											description: 'What happened',
											antecedent: 'What happened right before',
											injured: 'Injury',
											injuryDetail: 'Injury details',
											staffAction: 'What you did',
											medical: 'Medical follow-up',
											witnesses: 'Witnesses',
											severity: 'Severity',
											told: 'People already told',
											services: 'Services'
										} as Record<string, string>
									)[key] ?? key}
								</dt>
								<dd>{Array.isArray(value) ? value.join(', ') : String(value ?? '')}</dd>{/each}
						</dl>{:else}<button class="btn" onclick={resumeDraft}>Resume unfinished form</button
						>{/if}
					<button
						class="btn sec"
						onclick={() => {
							if (confirm('Discard this recovery draft from this device?')) void discardDraft();
						}}>Discard recovery draft</button
					>
				</section>
			{:else}
				{#if initialDraft && current === 'health'}<p class="callout">
						Recovered unfinished observations. Check the timing before saving; a new health entry
						records the time you save it.
					</p>{/if}
				{#if draftSaved && dirty}<p role="status">
						Recovery draft saved on this device. Check saved records before submitting.
					</p>{/if}
				{#if dirty && current !== 'medications'}<button
						type="button"
						class="textbtn"
						disabled={busy || draftAction}
						onclick={() => {
							if (confirm('Discard this unfinished form and its recovery draft?'))
								void discardDraft();
						}}>Discard unfinished form</button
					>{/if}
				{#key `${clientId}:${current}:${generation}`}{#if current === 'medications'}<MedicationRecords
							{clientId}
							onSaved={saved}
							onDirty={changed}
							onBusyChange={busyChanged}
						/>{:else if current === 'health'}<HealthRecords
							{clientId}
							onSaved={saved}
							onDirty={changed}
							onBusyChange={busyChanged}
							{initialDraft}
							onDraft={draftChanged}
						/>{:else if current === 'incident'}<IncidentRecords
							{clientId}
							onSaved={saved}
							onDirty={changed}
							onBusyChange={busyChanged}
							{initialDraft}
							onDraft={draftChanged}
						/>{:else}<AttendanceRecords
							{clientId}
							onSaved={saved}
							onDirty={changed}
							onBusyChange={busyChanged}
							{initialDraft}
							onDraft={draftChanged}
						/>{/if}{/key}{/if}
		</div>
	{:else}<p class="card empty">
			This person’s record is not available on your device. Check your selected home or wait for
			sync.
		</p>{/if}
</div>

<style>
	dd {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.care-screen {
		max-width: 720px;
	}
</style>
