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
	/** Shifts each person already has this week, at any home (prd.md US-17). */
	const weekCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const s of app.shifts)
			if (s.assigned_to && s.day! >= start && s.day! <= addDays(start, 6))
				counts[s.assigned_to] = (counts[s.assigned_to] ?? 0) + 1;
		return counts;
	});
	const CALLOUT_REASONS = ['Sick', 'Family emergency', 'Transportation', 'Other'];
	/** The shift whose "I can't make this shift" form is open (day:shift). */
	let calloutFor = $state('');
	let calloutReason = $state('');
	let calloutDetail = $state('');

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
	// Fill this week's open slots with last week's assignments (frontend-audit.md finding 17).
	async function copyLastWeek() {
		if (!online || !app.homeId || busy) return;
		const homeId = app.homeId;
		const operationScope = context;
		messageScope = operationScope;
		busy = true;
		message = '';
		try {
			const { copied, skipped } = await trpc.schedule.copyWeek.mutate({
				homeId,
				fromWeek: addDays(start, -7),
				toWeek: start
			});
			const unavailable = skipped.filter((s) => s.reason === 'unavailable').length;
			const kept = skipped.length - unavailable;
			if (context === operationScope)
				message = [
					copied
						? `Copied ${copied} ${copied === 1 ? 'shift' : 'shifts'} from last week. Updates will appear after sync.`
						: 'Nothing to copy: last week had no assignments for the open shifts here.',
					kept ? `${kept} already assigned, being covered or started, left as they were.` : '',
					unavailable
						? `${unavailable} left open: the staff member is no longer available for this home or that shift.`
						: ''
				]
					.filter(Boolean)
					.join(' ');
		} catch {
			if (context === operationScope)
				message = 'Could not copy last week. Reconnect and try again.';
		} finally {
			busy = false;
		}
	}
	// Saved weeks for this home (frontend-audit.md finding 17).
	type Template = Awaited<ReturnType<typeof trpc.schedule.templates.query>>[number];
	let templates = $state<Template[]>([]);
	let templateId = $state('');
	let templateName = $state('');
	async function loadTemplates() {
		if (!manager || !online || !app.homeId) return;
		const homeId = app.homeId;
		try {
			const list = await trpc.schedule.templates.query({ homeId });
			if (app.homeId !== homeId) return;
			templates = list;
			if (!list.some((t) => t.id === templateId)) templateId = list[0]?.id ?? '';
		} catch {
			templates = [];
		}
	}
	$effect(() => {
		void app.homeId;
		void online;
		void loadTemplates();
	});
	/** Runs a schedule change and reports it for the week on screen. */
	async function run(work: () => Promise<string>, failure: string) {
		if (!online || !app.homeId || busy) return;
		const operationScope = context;
		messageScope = operationScope;
		busy = true;
		message = '';
		try {
			const done = await work();
			if (context === operationScope) message = done;
		} catch (e) {
			if (context === operationScope)
				message = e instanceof Error && e.message ? e.message : failure;
		} finally {
			busy = false;
		}
	}
	const saveTemplate = () =>
		run(async () => {
			const saved = await trpc.schedule.saveTemplate.mutate({
				homeId: app.homeId!,
				name: templateName,
				fromWeek: start
			});
			templateName = '';
			templateId = saved.id;
			await loadTemplates();
			return `Saved “${saved.name}” with ${saved.shifts} ${saved.shifts === 1 ? 'shift' : 'shifts'}.`;
		}, 'Could not save the template. Reconnect and try again.');
	const applyTemplate = () =>
		run(async () => {
			const name = templates.find((t) => t.id === templateId)?.name ?? 'the template';
			const { copied, skipped } = await trpc.schedule.applyTemplate.mutate({
				id: templateId,
				toWeek: start
			});
			const unavailable = skipped.filter((x) => x.reason === 'unavailable').length;
			return [
				`Filled ${copied} open ${copied === 1 ? 'shift' : 'shifts'} from “${name}”. Updates will appear after sync.`,
				skipped.length - unavailable
					? `${skipped.length - unavailable} already assigned, being covered or started, left as they were.`
					: '',
				unavailable
					? `${unavailable} left open: the staff member is no longer available for this home or that shift.`
					: ''
			]
				.filter(Boolean)
				.join(' ');
		}, 'Could not apply the template. Reconnect and try again.');
	// Suggested staff for open shifts (frontend-audit.md finding 17, fix 2):
	// shown for review; only the checked ones are assigned.
	type Suggestion = Awaited<ReturnType<typeof trpc.schedule.suggest.query>>[number];
	let suggestions = $state<(Suggestion & { keep: boolean })[] | null>(null);
	let suggestedFor = $state('');
	const WHY: Record<string, string> = {
		already_working: 'everyone trained here already works that day',
		over_40_hours: 'everyone free would go over 40 hours',
		not_med_certified: 'doses are due and nobody free is med-certified',
		not_trained_at_home: 'nobody is trained for this home',
		called_out: 'nobody free',
		inactive: 'nobody free'
	};
	const suggest = () =>
		run(async () => {
			const list = await trpc.schedule.suggest.query({ homeId: app.homeId!, weekStart: start });
			suggestions = list.map((x) => ({ ...x, keep: !!x.profileId }));
			suggestedFor = context;
			const n = list.filter((x) => x.profileId).length;
			return list.length
				? `${n} of ${list.length} open ${list.length === 1 ? 'shift' : 'shifts'} have a suggestion. Check them, then assign.`
				: 'No open shifts to fill this week.';
		}, 'Could not suggest staff. Reconnect and try again.');
	const applySuggestions = () =>
		run(async () => {
			const picks = (suggestions ?? [])
				.filter((x) => x.keep && x.profileId)
				.map((x) => ({ day: x.day, shift: x.shift, profileId: x.profileId! }));
			const { copied, skipped } = await trpc.schedule.applySuggestions.mutate({
				homeId: app.homeId!,
				weekStart: start,
				picks
			});
			suggestions = null;
			return [
				`Assigned ${copied} ${copied === 1 ? 'shift' : 'shifts'}. Updates will appear after sync.`,
				skipped.length
					? `${skipped.length} changed since the suggestion and ${skipped.length === 1 ? 'was' : 'were'} left as ${skipped.length === 1 ? 'it was' : 'they were'}.`
					: ''
			]
				.filter(Boolean)
				.join(' ');
		}, 'Could not assign the suggestions. Reconnect and try again.');
	const shiftName = (key: string) => SHIFTS.find((x) => x.key === key)?.label ?? key;
	const dayName = (day: string) =>
		new Date(day + 'T12:00:00').toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});

	const deleteTemplate = () => {
		const name = templates.find((t) => t.id === templateId)?.name;
		if (!name || !confirm(`Delete the template “${name}”? Schedules already filled stay.`)) return;
		return run(async () => {
			await trpc.schedule.deleteTemplate.mutate({ id: templateId });
			await loadTemplates();
			return `Deleted “${name}”.`;
		}, 'Could not delete the template. Reconnect and try again.');
	};

	// Drag a staff name onto a shift (desktop); each shift's list does the same.
	let dragging = $state<string | null>(null);
	let dropTarget = $state('');
	async function dropOn(day: string, shift: 'am' | 'pm' | 'on') {
		const id = dragging;
		dragging = null;
		dropTarget = '';
		if (id) await assign(day, shift, id);
	}

	async function cover(day: string, shift: 'am' | 'pm' | 'on', reason?: string) {
		if (!online || !app.homeId || busy) return false;
		const homeId = app.homeId;
		const operationScope = context;
		messageScope = operationScope;
		busy = true;
		message = '';
		try {
			if (manager) await trpc.schedule.postOpen.mutate({ homeId, day, shift });
			else await trpc.coverage.callout.mutate({ homeId, day, shift, reason });
			calloutFor = '';
			calloutReason = '';
			calloutDetail = '';
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
		</p>
		<button class="btn sec" disabled={busy || !online || !app.homeId} onclick={copyLastWeek}
			>Copy last week’s assignments</button
		>
		<section class="card pad stack" aria-labelledby="suggest-h">
			<h2 id="suggest-h">Fill open shifts</h2>
			<p class="muted s14">
				Lomi suggests trained staff who are free, under 40 hours and med-certified when doses are
				due. Nothing is assigned until you choose.
			</p>
			<div class="actions">
				<button class="btn sec" disabled={busy || !online || !app.homeId} onclick={suggest}
					>Suggest staff for open shifts</button
				>
			</div>
			{#if suggestions?.length && suggestedFor === context}<fieldset class="stack suggestions">
					<legend class="sr">Suggested assignments</legend>
					{#each suggestions as x (`${x.day}:${x.shift}`)}{#if x.profileId}<label class="check"
								><input type="checkbox" bind:checked={x.keep} disabled={busy} />{dayName(x.day)}
								· {shiftName(x.shift)}:
								<b>{app.staff.find((p) => p.id === x.profileId)?.name ?? 'Staff member'}</b></label
							>{:else}<p class="muted s14">
								{dayName(x.day)} · {shiftName(x.shift)}: no suggestion ({WHY[x.reason ?? ''] ??
									'nobody free'})
							</p>{/if}{/each}
					<div class="actions">
						<button
							class="btn"
							disabled={busy || !online || !suggestions.some((x) => x.keep && x.profileId)}
							onclick={applySuggestions}>Assign checked</button
						><button type="button" class="textbtn" onclick={() => (suggestions = null)}
							>Dismiss</button
						>
					</div>
				</fieldset>{/if}
		</section>
		<section class="card pad stack" aria-labelledby="templates-h">
			<h2 id="templates-h">Templates</h2>
			<p class="muted s14">
				Save a week your team usually works, then use it to fill the open shifts of any week.
			</p>
			{#if templates.length}<div class="template-row">
					<label class="grow"
						>Template<select class="input" bind:value={templateId} disabled={busy || !online}
							>{#each templates as t (t.id)}<option value={t.id}
									>{t.name} ({t.shifts} {t.shifts === 1 ? 'shift' : 'shifts'})</option
								>{/each}</select
						></label
					><button class="btn sec" disabled={busy || !online || !templateId} onclick={applyTemplate}
						>Fill open shifts from template</button
					><button
						class="textbtn"
						disabled={busy || !online || !templateId}
						onclick={deleteTemplate}>Delete template</button
					>
				</div>{/if}
			<form
				class="template-row"
				onsubmit={(e) => {
					e.preventDefault();
					void saveTemplate();
				}}
			>
				<label class="grow"
					>Save this week as<input
						class="input"
						maxlength="60"
						placeholder="Usual week"
						bind:value={templateName}
						disabled={busy || !online}
					/></label
				><button class="btn sec" disabled={busy || !online || !templateName.trim()}
					>Save template</button
				>
			</form>
		</section>
		{#if staff.length && online}<div class="palette" aria-hidden="true">
				<p class="muted s13">Drag a name onto a shift, or choose from each shift’s list.</p>
				<ul>
					{#each staff as person (person.id)}<li
							class="chip"
							draggable="true"
							ondragstart={(e) => {
								dragging = person.id;
								e.dataTransfer?.setData('text/plain', person.id);
							}}
							ondragend={() => {
								dragging = null;
								dropTarget = '';
							}}
						>
							{person.name}
						</li>{/each}
				</ul>
			</div>{/if}{/if}
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
					<div
						class="stack cell"
						class:drop={dropTarget === `${day}:${shift.key}`}
						role="group"
						aria-label="{day} {shift.label}"
						ondragover={(e) => {
							if (!manager || !dragging) return;
							e.preventDefault();
							dropTarget = `${day}:${shift.key}`;
						}}
						ondragleave={() => {
							if (dropTarget === `${day}:${shift.key}`) dropTarget = '';
						}}
						ondrop={(e) => {
							if (!manager || !dragging) return;
							e.preventDefault();
							void dropOn(day, shift.key);
						}}
					>
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
									><option value="">Open shift</option
									>{#each staff as person (person.id)}{@const n = weekCounts[person.id] ?? 0}<option
											value={person.id}
											>{person.name} · {n} {n === 1 ? 'shift' : 'shifts'} this week</option
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
								onclick={() =>
									manager ? cover(day, shift.key) : (calloutFor = `${day}:${shift.key}`)}
								>{slot?.status === 'filling'
									? 'Finding cover…'
									: manager
										? 'Find cover with Lomi'
										: 'I can’t make this shift'}</button
							>{/if}
						{#if !manager && calloutFor === `${day}:${shift.key}`}<form
								class="stack callout-form"
								aria-label="Why you can’t make this shift"
								onsubmit={(e) => {
									e.preventDefault();
									void cover(
										day,
										shift.key,
										[calloutReason, calloutDetail.trim()].filter(Boolean).join(': ')
									);
								}}
							>
								<label
									>Reason<select
										class="input"
										aria-label="Reason"
										bind:value={calloutReason}
										required
										><option value="" disabled>Choose a reason</option
										>{#each CALLOUT_REASONS as r (r)}<option>{r}</option>{/each}</select
									></label
								>
								<label
									>Anything your supervisor should know (optional)<input
										class="input"
										maxlength="300"
										bind:value={calloutDetail}
									/></label
								>
								<p class="muted s13">Only your supervisors see this.</p>
								<div class="actions">
									<button class="btn" disabled={busy || !calloutReason}>Request cover</button
									><button type="button" class="btn sec" onclick={() => (calloutFor = '')}
										>Cancel</button
									>
								</div>
							</form>{/if}
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
	.template-row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-end;
	}
	.palette ul {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		cursor: grab;
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--sky);
		font-size: 14px;
		font-weight: 600;
	}
	.cell {
		border-radius: 12px;
		outline: 2px dashed transparent;
		outline-offset: 4px;
	}
	.cell.drop {
		outline-color: var(--blue);
	}
	@media (max-width: 600px), (pointer: coarse) {
		.palette {
			display: none;
		}
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
