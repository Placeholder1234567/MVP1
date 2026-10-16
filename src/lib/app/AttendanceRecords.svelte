<script lang="ts">
	import { useSession, parseJson } from './session.svelte';
	import { ATTENDANCE_SERVICES, localTime } from '#lib/domain/index.ts';
	import { insertClinical, timeOf } from './clinical-write';
	let { clientId, onSaved }: { clientId: string; onSaved?: () => void } = $props();
	const app = useSession();
	const person = $derived(app.people.find((p) => p.id === clientId));
	const day = localTime(new Date(), app.user.timeZone).day;
	const saved = $derived(app.attendance.find((r) => r.client_id === clientId && r.day === day));
	const recorded = $derived(parseJson<string[]>(saved?.services, []));
	let services = $state<string[]>([]);
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
		error = '';
		try {
			// The server merges services into the day's record and never removes one.
			const union = [...new Set([...recorded, ...services])];
			const now = new Date().toISOString();
			if (saved && app.db)
				await app.db.execute('UPDATE attendance SET services = ?, updated_at = ? WHERE id = ?', [
					JSON.stringify(union),
					now,
					saved.id
				]);
			else
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
		}
	}
</script>

<div class="stack">
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
					><input type="checkbox" bind:group={services} value={service} /><span>{service}</span
					></label
				>{/if}{/each}
		<p class="muted s13">
			Saved services can’t be removed here. Ask your supervisor to correct them.
		</p>
		{#if error}<p class="callout bad" role="alert">{error}</p>{/if}
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		<button class="btn full" disabled={busy || !app.db}>Save attendance</button>
	</form>
</div>

<style>
	.tight {
		gap: 10px;
	}
</style>
