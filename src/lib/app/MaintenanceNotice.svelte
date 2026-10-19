<script lang="ts">
	// Admins announce a maintenance window to everyone active in the agency
	// (notifications.md §2.18). Times are in the agency's time zone; the text
	// is fixed wording, so nothing typed reaches lock screens or email.
	import { trpc } from '#lib/trpc.ts';
	import {
		MAINTENANCE_IMPACTS,
		localInstant,
		maintenanceBody,
		maintenanceTitle,
		maintenanceWindowError,
		type MaintenanceImpact
	} from '#lib/domain/index.ts';

	let { timezone }: { timezone: string } = $props();
	let starts = $state('');
	let ends = $state('');
	let impact = $state<MaintenanceImpact>('unavailable');
	let busy = $state(false);
	let message = $state('');
	let error = $state('');
	// One ID per announcement, so a double submit or retry sends it once.
	let announcementId = $state(crypto.randomUUID());

	const IMPACT_LABELS: Record<MaintenanceImpact, string> = {
		unavailable: 'Guad will be unavailable',
		slow: 'Guad may be slow',
		sync_paused: 'Syncing will pause'
	};
	const at = (v: string) => (v ? localInstant(v.slice(0, 10), v.slice(11, 16), timezone) : null);
	const slot = $derived.by(() => {
		const s = at(starts);
		const e = at(ends);
		if (!s || !e) return null;
		return { s, e, problem: maintenanceWindowError(s, e, new Date()) };
	});

	async function announce(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		message = '';
		if (!slot || slot.problem) {
			error = slot?.problem ?? 'Choose when maintenance starts and ends.';
			return;
		}
		if (!confirm('Send this announcement to everyone active in your agency?')) return;
		busy = true;
		try {
			const r = await trpc.agency.announceMaintenance.mutate({
				id: announcementId,
				startsAt: slot.s,
				endsAt: slot.e,
				impact
			});
			message = r.alreadySent
				? 'This announcement was already sent.'
				: `Sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}.`;
			announcementId = crypto.randomUUID();
			starts = '';
			ends = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not send the announcement. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<form class="card pad stack" onsubmit={announce} aria-labelledby="maintenance-heading">
	<h2 id="maintenance-heading">Announce maintenance</h2>
	<p class="muted">
		Tell everyone active in your agency when Guad will be down, by app alert, push and email. Times
		are in {timezone}.
	</p>
	<fieldset class="stack" disabled={busy}>
		<div class="grid2">
			<label>Starts<input class="input" type="datetime-local" required bind:value={starts} /></label
			>
			<label>Ends<input class="input" type="datetime-local" required bind:value={ends} /></label>
		</div>
		<fieldset class="stack">
			<legend>What people should expect</legend>
			{#each Object.keys(MAINTENANCE_IMPACTS) as key (key)}<label class="check"
					><input type="radio" name="impact" value={key} bind:group={impact} />{IMPACT_LABELS[
						key as MaintenanceImpact
					]}</label
				>{/each}
		</fieldset>
		{#if slot && !slot.problem}<div class="callout" role="group" aria-label="Announcement preview">
				<p><b>{maintenanceTitle(slot.s, slot.e, timezone)}</b></p>
				<p>{maintenanceBody(impact)}</p>
			</div>{:else if slot?.problem}<p class="muted">{slot.problem}</p>{/if}
		{#if error}<p role="alert" class="callout bad">{error}</p>{/if}
		{#if message}<p role="status" class="callout">{message}</p>{/if}
		<div class="actions"><button class="btn">Send announcement</button></div>
	</fieldset>
</form>
