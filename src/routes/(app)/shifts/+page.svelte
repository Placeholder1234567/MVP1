<script lang="ts">
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { addDays, localTime, SHIFTS, weekStart, shiftIsPast } from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';
	import ClockPanel from '#lib/app/ClockPanel.svelte';
	import { onMount } from 'svelte';
	import CoverageActivity from '#lib/app/CoverageActivity.svelte';
	import CoverageOffers from '#lib/app/CoverageOffers.svelte';
	const app = useSession();
	let start = $state(weekStart(localTime(new Date(), app.user.timeZone).day));
	let busy = $state(false);
	let message = $state('');
	let online = $state(true);
	let messageScope = $state('');
	const context = $derived(`${app.homeId}:${start}`);
	onMount(() => {
		online = navigator.onLine;
	});
	const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
	const manager = $derived(app.user.role !== 'caregiver');
	const staff = $derived(
		app.staff.filter((p) => p.active && parseJson<string[]>(p.home_ids, []).includes(app.homeId))
	);
	const slots = $derived(
		app.shifts.filter(
			(s) => s.home_id === app.homeId && s.day! >= start && s.day! <= addDays(start, 6)
		)
	);
	async function assign(day: string, shift: 'am' | 'pm' | 'on', profileId: string) {
		if (!online || !app.homeId || busy) return false;
		const homeId = app.homeId;
		const operationScope = context;
		messageScope = operationScope;
		busy = true;
		message = '';
		try {
			if (profileId) await trpc.schedule.setSlot.mutate({ homeId, day, shift, profileId });
			else await trpc.schedule.clearSlot.mutate({ homeId, day, shift });
			if (context === operationScope) message = 'Schedule saved. Updates will appear after sync.';
			return true;
		} catch {
			if (context === operationScope)
				message =
					'Could not save this assignment. Check that the staff member is trained for this home and not already assigned elsewhere.';
			return false;
		} finally {
			busy = false;
		}
	}
	async function cover(day: string, shift: 'am' | 'pm' | 'on') {
		if (!online || !app.homeId || busy) return false;
		const homeId = app.homeId;
		const operationScope = context;
		messageScope = operationScope;
		busy = true;
		message = '';
		try {
			if (manager) await trpc.schedule.postOpen.mutate({ homeId, day, shift });
			else await trpc.coverage.callout.mutate({ homeId, day, shift });
			if (context === operationScope)
				message = 'Coverage requested. Eligible staff will receive an offer.';
		} catch {
			if (context === operationScope)
				message = 'Could not request coverage. Reconnect and check the current assignment.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />
<svelte:head><title>Schedule · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Plan your week</p>
	<h1>{manager ? 'The right support, every shift.' : 'Your upcoming shifts.'}</h1>
	<ClockPanel />
	<CoverageOffers />
	<div class="spread">
		<button class="btn sec" disabled={busy} onclick={() => (start = addDays(start, -7))}
			>← Previous week</button
		><b>Week of {start}</b><button
			class="btn sec"
			disabled={busy}
			onclick={() => (start = addDays(start, 7))}>Next week →</button
		>
	</div>
	{#if manager}<p class="muted">
			Assignments require a connection. Your saved schedule stays available offline.
		</p>{/if}
	{#if !online}<p class="callout" role="status">
			You’re offline. Read saved recent activity; reconnect to change assignments or request
			coverage.
		</p>{/if}
	{#if message && messageScope === context}<p class="callout" role="status">{message}</p>{/if}
	{#each days as day (day)}<section class="card pad stack">
			<h2>
				{new Date(day + 'T12:00:00').toLocaleDateString(undefined, {
					weekday: 'long',
					month: 'short',
					day: 'numeric'
				})}
			</h2>
			<div class="shift-grid">
				{#each SHIFTS as shift (shift.key)}{@const slot = slots.find(
						(s) => s.day === day && s.shift === shift.key
					)}
					<div class="stack">
						<div>
							<b>{shift.label}</b>
							<p class="muted">{shift.start}–{shift.end}</p>
						</div>
						{#if manager}<label
								><span class="sr">{day} {shift.label} assignment</span><select
									class="input"
									value={slot?.assigned_to ?? ''}
									disabled={busy || !online || !app.homeId}
									onchange={async (e) => {
										const control = e.currentTarget;
										const before = slot?.assigned_to ?? '';
										const originalScope = context;
										if (!(await assign(day, shift.key, control.value)) && context === originalScope)
											control.value = before;
									}}
									><option value="">Open shift</option>{#each staff as person (person.id)}<option
											value={person.id}>{person.name}</option
										>{/each}</select
								></label
							>{:else}<p>
								{slot?.assigned_to === app.user.profileId
									? 'You are assigned'
									: slot?.assigned_to
										? (app.staff.find((p) => p.id === slot.assigned_to)?.name ?? 'Assigned')
										: 'Open shift'}
							</p>{/if}{#if slot?.via_lomi}<span class="pill">Covered with Lomi</span>{/if}
						{#if !shiftIsPast(day, shift.key, new Date(), app.user.timeZone) && ((manager && !slot?.assigned_to) || (!manager && slot?.assigned_to === app.user.profileId))}<button
								class="textbtn"
								disabled={busy || !online || !app.homeId || slot?.status === 'filling'}
								onclick={() => cover(day, shift.key)}
								>{slot?.status === 'filling'
									? 'Finding cover…'
									: manager
										? 'Find cover with Lomi'
										: 'I can’t make this shift'}</button
							>{/if}
					</div>{/each}
			</div>
		</section>{/each}
	{#if manager}<CoverageActivity />{/if}
</div>

<style>
	.shift-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 18px;
	}
	@media (max-width: 600px) {
		.shift-grid {
			grid-template-columns: 1fr;
		}
		.shift-grid > div {
			border-top: 1px solid var(--line);
			padding-top: 14px;
		}
	}
</style>
