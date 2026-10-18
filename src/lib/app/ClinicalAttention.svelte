<script lang="ts">
	import { resolve } from '$app/paths';
	import { beforeNavigate } from '$app/navigation';
	import { useSession, parseJson } from './session.svelte';
	import {
		attentionItems,
		localTime,
		URGENCY_BANDS,
		parseReportDetails,
		reportDetailRows,
		type AttentionItem
	} from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';
	import { canReachServer, dayTimeOf } from './clinical-write';
	const app = useSession();
	const tz = app.user.timeZone;
	const today = localTime(new Date(), tz).day;
	let busy = $state(false);
	let message = $state('');
	let selected = $state('');
	let selectedHome = $state('');
	let messageHome = $state('');
	let followup = $state('');
	let contacted = $state('');
	const dirty = $derived(!!followup.trim() || !!contacted.trim());
	const inHome = (r: { home_id: string | null }) => r.home_id === app.homeId;
	const items = $derived(
		attentionItems({
			today,
			incidentRules: app.incidentRules,
			incidents: app.incidents.filter(inHome),
			health: app.health.filter(inHome),
			doses: app.doses.filter(inHome).map((r) => ({
				...r,
				medicationName: app.medications.find((m) => m.id === r.medication_id)?.name
			})),
			coverage: app.coverage.filter(inHome),
			clocks: app.clocks.filter(inHome).map((k) => ({
				...k,
				staffName: app.staff.find((p) => p.id === k.profile_id)?.name
			})),
			notes: app.notes.filter(inHome),
			counts: app.controlledCounts.filter(inHome).map((c) => ({
				...c,
				medicationName: app.medications.find((m) => m.id === c.medication_id)?.name
			})),
			countersignHours: app.controlledRules.countersignHours
		})
	);
	const incident = $derived(
		app.incidents.find(
			(r) => r.id === selected && r.home_id === selectedHome && selectedHome === app.homeId
		)
	);
	// Team messages that follow up on the incident under review.
	const discussion = $derived(
		incident ? app.messages.filter((m) => m.incident_id === incident.id).length : 0
	);
	function discard() {
		return !busy && (!dirty || confirm('Discard your unsaved follow-up and contact entries?'));
	}
	beforeNavigate(({ type, cancel }) => {
		if (type === 'leave') {
			if (busy || dirty) cancel();
		} else if (!discard()) cancel();
	});
	const person = (id: string | null) => app.people.find((p) => p.id === id);
	const PILL: Record<AttentionItem['pill'], string> = {
		Incident: 'bad',
		Health: 'bad',
		Medication: 'due',
		Coverage: 'bad',
		'Check-in': 'due',
		Review: ''
	};
	function offline() {
		messageHome = app.homeId;
		if (!app.privacyLocked && canReachServer(app)) return false;
		message = 'Reconnect and let changes finish syncing first.';
		return true;
	}
	async function acknowledge(item: AttentionItem) {
		if (busy || offline()) return;
		busy = true;
		message = '';
		try {
			if (item.kind === 'health') await trpc.health.acknowledge.mutate({ id: item.id });
			else if (item.kind === 'dose') await trpc.mar.acknowledge.mutate({ id: item.id });
			else if (item.kind === 'clock') await trpc.clock.acknowledge.mutate({ id: item.id });
			message = 'Marked as followed up. The list updates after sync.';
		} catch {
			message = 'Could not save. Try again.';
		} finally {
			busy = false;
		}
	}
	async function review() {
		if (!incident || busy || offline()) return;
		if (contacted.trim()) {
			message = 'Record the contact or clear its entry before closing this report.';
			return;
		}
		if (!followup.trim()) {
			message = 'Add your follow-up notes.';
			return;
		}
		busy = true;
		const id = incident.id;
		try {
			await trpc.incident.review.mutate({ id, followupNotes: followup });
			selected = '';
			selectedHome = '';
			followup = '';
			message = 'Review saved. The list updates after sync.';
		} catch {
			message = 'Could not save the review. Your notes are still here; try again.';
		} finally {
			busy = false;
		}
	}
	async function markContacted() {
		if (!incident || !contacted.trim() || busy || offline()) return;
		busy = true;
		try {
			await trpc.incident.markNotified.mutate({ id: incident.id, party: contacted });
			contacted = '';
			message = 'Contact recorded. This does not send a message.';
		} catch {
			message = 'Could not record the contact. Try again.';
		} finally {
			busy = false;
		}
	}
	function openReview(id: string) {
		if (!discard()) return;
		selected = id;
		selectedHome = app.homeId;
		messageHome = app.homeId;
		followup = '';
		contacted = '';
		message = '';
	}
	const when = (item: AttentionItem) => (item.kind === 'coverage' ? '' : dayTimeOf(item.at, tz));
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (busy || dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>

{#snippet row(item: AttentionItem)}
	{@const p = person(item.clientId)}
	<div class="row attention-row">
		<span class="avatar" aria-hidden="true"
			>{p ? p.initials || p.name?.slice(0, 2) : item.kind === 'coverage' ? '◷' : '•'}</span
		>
		<span class="grow"
			><b>{p ? `${p.name}: ` : ''}{item.title}</b><span
				>{[item.detail, when(item)].filter(Boolean).join(' · ')}</span
			></span
		>
		<span class="pill {PILL[item.pill]}">{item.pill}</span>
		<span class="acts">
			{#if item.kind === 'incident'}<button
					type="button"
					class="btn sec sm"
					disabled={busy}
					onclick={() => openReview(item.id)}>Review</button
				>{:else if item.kind === 'note'}<a
					class="btn sec sm"
					href={resolve('/(app)/dashboard/notes')}>Open</a
				>{:else if item.kind === 'controlled'}<a
					class="btn sec sm"
					href={resolve('/(app)/controlled')}>Count book</a
				>{:else if item.kind === 'coverage'}<a class="btn sec sm" href={resolve('/(app)/shifts')}
					>Schedule</a
				>{:else}{#if item.kind === 'clock'}<a
						class="textbtn"
						href={resolve('/(app)/dashboard/timesheets')}>Timesheets</a
					>{:else if item.clientId}<a
						class="textbtn"
						href={resolve(
							item.kind === 'health'
								? '/(app)/people/[id]/health'
								: '/(app)/people/[id]/medications',
							{ id: item.clientId }
						)}>Open record</a
					>{/if}<button
					type="button"
					class="btn sec sm"
					disabled={busy}
					onclick={() => acknowledge(item)}>Mark followed up</button
				>{/if}
		</span>
	</div>
{/snippet}

<section class="stack" aria-labelledby="attention-h">
	<div class="section-title">
		<h2 id="attention-h">Needs your attention</h2>
		<span class="muted s14">{items.length ? `${items.length} items` : ''}</span>
	</div>
	{#if selected && selectedHome !== app.homeId}<p class="callout" role="status">
			An unfinished review is kept for another home. Return to that home to continue.
		</p>{/if}
	{#if message && messageHome === app.homeId}<p class="callout" role="status">{message}</p>{/if}
	{#if incident}<article class="card pad stack" aria-label="Incident review">
			<h3>Review {app.labels.incident.toLowerCase()}</h3>
			<p>
				<b>{person(incident.client_id)?.name ?? 'Person'}</b> · {incident.type} · {incident.severity}
				severity · {dayTimeOf(incident.occurred_at, tz)}
			</p>
			{#each [['Where', incident.location], ['What happened', incident.description], ['Right before', incident.antecedent], ['Injury', [incident.injured, incident.injury_detail]
						.filter(Boolean)
						.join(': ')], ['What staff did', incident.staff_action], ['Medical follow-up', incident.medical_followup], ['Witnesses', incident.witnesses], ['Reported by', incident.author_name]] as [label, value] (label)}{#if value}<p
						class="record-text"
					>
						<b>{label}:</b>
						{value}
					</p>{/if}{/each}
			{#each reportDetailRows(parseReportDetails(incident.report_details)) as [label, value] (label)}<p
					class="record-text"
				>
					<b>{label}:</b>
					{value}
				</p>{/each}
			<p>
				<a href="{resolve('/(app)/messages')}?incident={incident.id}"
					>Discuss with the team{discussion
						? ` (${discussion} ${discussion === 1 ? 'message' : 'messages'})`
						: ''}</a
				>
			</p>
			<p>
				<b>Told:</b>
				{parseJson<string[]>(incident.notified_parties, []).join(', ') || 'No one recorded yet'}
			</p>
			<div class="contact">
				<label class="grow"
					>Record someone you contacted<input
						class="input"
						maxlength="100"
						placeholder="Family or guardian"
						bind:value={contacted}
						disabled={busy}
					/></label
				><button
					type="button"
					class="btn sec"
					disabled={busy || !contacted.trim()}
					onclick={markContacted}>Record contact</button
				>
			</div>
			<label
				>Your follow-up<textarea
					class="input"
					maxlength="8000"
					bind:value={followup}
					disabled={busy}></textarea></label
			>
			<div class="actions">
				<button type="button" class="btn" disabled={busy} onclick={review}
					>Save review and close report</button
				><button
					type="button"
					class="btn sec"
					disabled={busy}
					onclick={() => {
						if (discard()) {
							selected = '';
							selectedHome = '';
							followup = '';
							contacted = '';
						}
					}}>Cancel</button
				>
			</div>
		</article>{/if}
	{#if !items.length}<p class="card empty">You’re all caught up.</p>{/if}
	{#each URGENCY_BANDS as band (band.key)}{@const group = items.filter(
			(i) => i.urgency === band.key
		)}{#if group.length}{#if band.key === 'info'}<details class="card band">
					<summary
						>Show {group.length} informational {group.length === 1 ? 'item' : 'items'}</summary
					>
					<div class="list">
						{#each group as item (`${item.kind}:${item.id}`)}{@render row(item)}{/each}
					</div>
				</details>{:else}<div
					class="card band list"
					class:critical={band.key === 'critical'}
					class:action={band.key === 'action'}
					role="group"
					aria-label={band.label}
				>
					<p class="band-label">{band.label}</p>
					{#each group as item (`${item.kind}:${item.id}`)}{@render row(item)}{/each}
				</div>{/if}{/if}{/each}
</section>

<style>
	.band {
		overflow: hidden;
	}
	.band.critical {
		border-left: 3px solid var(--bad);
		background: rgba(180, 35, 24, 0.04);
	}
	.band.action {
		border-left: 3px solid #d97706;
	}
	.band-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		/* --muted, not --faint: 11px text needs 4.5:1, also on the critical tint. */
		color: var(--muted);
		padding: 12px 16px 0;
	}
	.band-label + :global(.row) {
		border-top: 0;
	}
	summary {
		cursor: pointer;
		min-height: 44px;
		padding: 12px 16px;
		font-weight: 600;
		color: var(--blue);
	}
	.attention-row {
		flex-wrap: wrap;
	}
	.acts {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.contact {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	:global(.btn.sm) {
		min-height: 44px;
		padding: 8px 16px;
		font-size: 14px;
	}
</style>
