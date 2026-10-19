<script lang="ts">
	// A person, for supervisors (frontend-spec-3.md §4.7 "Tab: Case Notes"):
	// case notes for care coordination, ISP meetings and family calls. Daily
	// care records stay on the person's care page. Case notes need a
	// connection and aren't synced to devices.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import Skeleton from '#lib/app/Skeleton.svelte';
	import VitalTrend from '#lib/app/VitalTrend.svelte';
	import HealthWatch from '#lib/app/HealthWatch.svelte';
	import GoalGlance from '#lib/app/GoalGlance.svelte';
	import { parseJson } from '#lib/app/session.svelte.ts';
	import {
		CASE_NOTE_CATEGORIES,
		CASE_NOTE_CATEGORY_LABEL,
		caseNoteCategoryLabel,
		localTime,
		trendSeries,
		parseVitalLimits,
		trendPoints,
		type CaseNoteCategory
	} from '#lib/domain/index.ts';

	type Note = Awaited<ReturnType<typeof trpc.caseNote.list.query>>[number];
	const PAGE = 50;
	const app = useSession();
	const id = $derived(page.params.id ?? '');
	const person = $derived(app.people.find((c) => c.id === id));
	const home = $derived(app.homes.find((h) => h.id === person?.home_id));
	const charting = $derived(
		((page.data.user?.features ?? []) as readonly string[]).includes('charting')
	);

	const goalsPlan = $derived(
		((page.data.user?.features ?? []) as readonly string[]).includes('goals')
	);
	const healthPlan = $derived(
		((page.data.user?.features ?? []) as readonly string[]).includes('health')
	);
	// Vital trends from the entries on this device (30 days of health sync).
	const trends = $derived.by(() => {
		const entries = app.health
			.filter((h) => h.client_id === id && h.kind === 'vitals')
			.map((h) => ({
				recorded_at: h.recorded_at,
				data: parseJson<Record<string, unknown>>(h.data, {})
			}));
		const limits = parseVitalLimits(app.healthInfo.find((h) => h.client_id === id)?.vital_limits);
		return trendSeries(limits)
			.map((series) => ({ series, points: trendPoints(entries, series) }))
			.filter((t) => t.points.length);
	});
	const dayLabel = (iso: string) => {
		const d = localTime(new Date(iso), app.user.timeZone).day;
		return new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	};

	let notes = $state<Note[]>([]);
	let body = $state('');
	let category = $state<CaseNoteCategory>('care_coordination');
	// Show one kind of note at a time; '' shows all.
	let showOnly = $state<CaseNoteCategory | ''>('');
	const shown = $derived(
		showOnly ? notes.filter((n) => (n.category ?? 'other') === showOnly) : notes
	);
	let busy = $state(false);
	let loaded = $state(false);
	let more = $state(false);
	let message = $state('');

	async function load(append = false) {
		busy = true;
		try {
			const rows = await trpc.caseNote.list.query({
				clientId: id,
				limit: PAGE,
				offset: append ? notes.length : 0
			});
			notes = append ? [...notes, ...rows] : rows;
			more = rows.length === PAGE;
			loaded = true;
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connect to load case notes.';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		if (charting) void load();
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const created = await trpc.caseNote.create.mutate({ clientId: id, body, category });
			notes = [created, ...notes];
			body = '';
			message = 'Case note saved.';
		} catch (e) {
			// Keep the text so nothing typed is lost.
			message = e instanceof Error ? e.message : 'Could not save. Your text is kept here.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{person?.name ?? 'Person'} · Guad</title></svelte:head>

<section class="stack" aria-label="Person">
	<a href={resolve('/(app)/dashboard/people')}>← People</a>
	<div class="spread">
		<div>
			<h1>{person?.name ?? 'Person'}</h1>
			<p class="muted">{home?.name ?? 'No home yet'}</p>
		</div>
		<a class="btn sec" href={resolve('/(app)/people/[id]', { id })}>Care records</a>
	</div>

	{#if goalsPlan && person?.home_id}<GoalGlance clientId={id} homeId={person.home_id} />{/if}

	{#if healthPlan}
		<HealthWatch clientId={id} />
		<h2>Vital trends</h2>
		{#if trends.length}
			<p class="muted">
				Vitals saved on this device (about the last 30 days). Red points are outside the normal
				range.
			</p>
			<div class="trends">
				{#each trends as t (t.series.key)}<VitalTrend
						series={t.series}
						points={t.points}
						label={dayLabel}
					/>{/each}
			</div>
		{:else}<p class="muted">No vitals recorded in the last 30 days.</p>{/if}
	{/if}

	{#if !charting}
		<p class="muted">Case notes are part of the care records plan.</p>
	{:else}
		<h2>Case notes</h2>
		<p class="muted">
			Meetings, calls, plan changes. Notes can't be edited later; add a new note to correct one.
		</p>
		<form class="card pad stack" onsubmit={save}>
			<label
				>About<select class="input" bind:value={category} disabled={busy}
					>{#each CASE_NOTE_CATEGORIES as c (c)}<option value={c}
							>{CASE_NOTE_CATEGORY_LABEL[c]}</option
						>{/each}</select
				></label
			>
			<label
				>New case note<textarea
					class="input"
					rows="4"
					maxlength="10000"
					required
					placeholder="Meetings, calls, plan changes"
					bind:value={body}
					disabled={busy}></textarea></label
			>
			<div class="actions">
				<button class="btn" disabled={busy || !body.trim()}>Save case note</button>
			</div>
		</form>
		{#if message}<p class="callout" role="status">{message}</p>{/if}
		{#if !loaded}<Skeleton count={2} label="Loading case notes" />{:else}
			<label class="filter"
				>Show<select class="input" bind:value={showOnly}
					><option value="">All case notes</option>{#each CASE_NOTE_CATEGORIES as c (c)}<option
							value={c}>{CASE_NOTE_CATEGORY_LABEL[c]}</option
						>{/each}</select
				></label
			>
			<div class="list card" role="group" aria-label="Case note history">
				{#each shown as note (note.id)}
					<div class="row">
						<span class="grow"
							><b>{note.authorName ?? 'Staff'} · {new Date(note.createdAt).toLocaleString()}</b
							><span class="pill">{caseNoteCategoryLabel(note.category)}</span><span
								class="note-body">{note.body}</span
							></span
						>
					</div>
				{:else}
					<div class="row muted">
						{showOnly ? 'No case notes of this kind loaded.' : 'No case notes yet.'}
					</div>
				{/each}
			</div>
		{/if}
		{#if more}<button class="btn sec" disabled={busy} onclick={() => load(true)}>Older notes</button
			>{/if}
	{/if}
</section>

<style>
	.trends {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 12px;
	}
	.note-body {
		white-space: pre-wrap;
	}
	.grow .pill {
		align-self: flex-start;
		margin: 4px 0;
	}
	.filter {
		max-width: 320px;
	}
</style>
