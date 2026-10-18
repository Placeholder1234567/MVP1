<script lang="ts">
	// Supervisor MAR grid (frontend-spec-3.md §5.5, item #31; charting-guide.md
	// "Therap's eMAR"): a person's medications by dose time down the side and a
	// week across the top. Read from the records on this device (30 days of MAR),
	// so it works offline; doses are still recorded in Care records.
	import { resolve } from '$app/paths';
	import { parseJson, useSession } from '#lib/app/session.svelte.ts';
	import {
		addDays,
		compliance,
		complianceBand,
		localTime,
		marGrid,
		weekDays,
		weekStart,
		type GridCell
	} from '#lib/domain/index.ts';

	const app = useSession();
	const tz = app.user.timeZone;
	const nowLocal = localTime(new Date(), tz);
	const now = {
		day: nowLocal.day,
		time: `${String(nowLocal.hour).padStart(2, '0')}:${String(nowLocal.minute).padStart(2, '0')}`
	};
	const thisWeek = weekStart(now.day);
	/** The device keeps 30 days of MAR records, so four weeks back is as far as it can show. */
	const earliest = addDays(thisWeek, -28);

	let personId = $state('');
	let start = $state(thisWeek);
	const people = $derived(app.currentPeople);
	const person = $derived(people.find((p) => p.id === personId) ?? people[0]);
	// Keep the picker on a real person when the home or its people change.
	$effect(() => {
		if (person && person.id !== personId) personId = person.id;
	});
	const days = $derived(weekDays(start));
	const toDay = (iso: string) => localTime(new Date(iso), tz).day;

	const rows = $derived.by(() => {
		if (!person) return [];
		const meds = app.medications
			.filter((m) => m.client_id === person.id)
			.map((m) => ({
				id: m.id,
				name: m.name,
				dose: m.dose,
				scheduled_times: parseJson<string[]>(m.scheduled_times, []),
				started_at: m.started_at,
				stopped_at: m.stopped_at
			}));
		const records = app.doses
			.filter((r) => r.client_id === person.id && r.day && days.includes(r.day))
			.map((r) => ({
				id: r.id,
				medication_id: r.medication_id,
				day: r.day,
				scheduled_time: r.scheduled_time,
				status: r.status,
				is_prn: !!r.is_prn,
				amends_id: r.amends_id,
				conflict_with: r.conflict_with,
				recorded_at: r.recorded_at
			}));
		return marGrid(meds, records, days, now, toDay);
	});
	const score = $derived(compliance(rows));

	const dayLabel = (day: string) =>
		new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'numeric',
			day: 'numeric',
			timeZone: 'UTC'
		});
	const time12 = (t: string) => {
		const [h, m] = t.split(':').map(Number);
		return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
	};
	function describe(c: GridCell): string {
		switch (c.kind) {
			case 'given':
			case 'refused':
			case 'held': {
				const label = c.kind[0].toUpperCase() + c.kind.slice(1);
				return `${label}${c.corrected ? ', corrected' : ''}${c.conflict ? ', recorded twice' : ''}`;
			}
			case 'missing':
				return 'Not recorded';
			case 'upcoming':
				return 'Not due yet';
			case 'prn':
				return c.count
					? `Given as needed ${c.count} time${c.count === 1 ? '' : 's'}`
					: 'None given';
			default:
				return 'Not scheduled';
		}
	}
	const marked = (c: GridCell) =>
		(c.kind === 'given' || c.kind === 'refused' || c.kind === 'held') &&
		(c.corrected || c.conflict);
</script>

<svelte:head><title>MAR grid · Guad</title></svelte:head>

<section class="stack" aria-label="MAR grid">
	<div class="spread">
		<div>
			<h1>MAR grid</h1>
			<p class="muted">
				{app.homes.find((h) => h.id === app.homeId)?.name ?? 'Your home'} · doses are recorded in
				<a href={resolve('/(app)/today')}>Care records</a>
			</p>
		</div>
		<label
			>Person<select class="input" bind:value={personId}
				>{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select
			></label
		>
	</div>

	<div class="actions" role="group" aria-label="Week">
		<button
			type="button"
			class="btn sec"
			disabled={start <= earliest}
			onclick={() => (start = addDays(start, -7))}>Previous week</button
		>
		<button
			type="button"
			class="btn sec"
			disabled={start === thisWeek}
			onclick={() => (start = thisWeek)}>This week</button
		>
		<button
			type="button"
			class="btn sec"
			disabled={start >= thisWeek}
			onclick={() => (start = addDays(start, 7))}>Next week</button
		>
	</div>

	{#if !person}
		<p class="muted">No one lives at this home yet.</p>
	{:else if !rows.length}
		<p class="muted">{person.name} has no medications in this week.</p>
	{:else}
		<!-- Focusable so keyboard users can scroll the grid on narrow screens. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="scroll" role="region" aria-label="Doses by day" tabindex="0">
			<table class="mar-grid">
				<caption class="visually-hidden"
					>Medication record for {person.name}, week of {dayLabel(start)}</caption
				>
				<thead>
					<tr>
						<th scope="col">Medication</th>
						{#each days as day (day)}
							<th scope="col" class:today={day === now.day}>{dayLabel(day)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (`${row.medicationId}|${row.time}`)}
						<tr>
							<th scope="row">
								<b>{row.name}</b>
								<span class="muted"
									>{row.dose}{row.dose ? ' · ' : ''}{row.time
										? time12(row.time)
										: 'As needed'}</span
								>
							</th>
							{#each row.cells as cell, i (i)}
								<td>
									<span
										class="mark {cell.kind}"
										class:zero={cell.kind === 'prn' && !cell.count}
										role="img"
										title={describe(cell)}
										aria-label={describe(cell)}
										>{#if cell.kind === 'given'}✓{:else if cell.kind === 'refused'}R{:else if cell.kind === 'held'}H{:else if cell.kind === 'prn'}{cell.count ||
												''}{:else if cell.kind === 'na'}—{/if}{#if marked(cell)}<i
												aria-hidden="true">*</i
											>{/if}</span
									>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if score.percent !== null}
			<div class="stack compliance">
				<div class="spread">
					<b>Doses given</b><span>{score.given} of {score.due} due · {score.percent}%</span>
				</div>
				<div
					class="bar"
					role="progressbar"
					aria-label="Doses given"
					aria-valuenow={score.percent}
					aria-valuemin={0}
					aria-valuemax={100}
				>
					<i class={complianceBand(score.percent)} style:width="{score.percent}%"></i>
				</div>
			</div>
		{/if}

		<ul class="legend muted" aria-label="Key">
			<li><span class="mark given" aria-hidden="true">✓</span> Given</li>
			<li><span class="mark refused" aria-hidden="true">R</span> Refused</li>
			<li><span class="mark held" aria-hidden="true">H</span> Held</li>
			<li><span class="mark missing" aria-hidden="true"></span> Not recorded</li>
			<li><span class="mark upcoming" aria-hidden="true"></span> Not due yet</li>
			<li><span class="mark na" aria-hidden="true">—</span> Not scheduled</li>
			<li><span class="mark prn" aria-hidden="true">2</span> As-needed doses given</li>
			<li>* Corrected, or recorded twice while offline</li>
		</ul>
	{/if}
</section>

<style>
	/* frontend-spec-3.md §5.5 .mar-grid */
	.scroll {
		overflow-x: auto;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.mar-grid {
		min-width: 700px;
		width: 100%;
		border-collapse: separate;
		border-spacing: 2px;
	}
	.mar-grid th,
	.mar-grid td {
		text-align: center;
		padding: 4px;
		min-width: 44px;
		height: 44px;
	}
	.mar-grid thead th {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.mar-grid thead th.today {
		color: var(--blue);
	}
	.mar-grid tbody th {
		width: 160px;
		text-align: left;
		font-weight: normal;
	}
	.mar-grid tbody th b {
		display: block;
		font-size: 14px;
	}
	.mar-grid tbody th span {
		font-size: 13px;
	}
	.mark {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 13px;
		font-weight: 700;
	}
	.mark i {
		position: absolute;
		top: -6px;
		right: -6px;
		font-style: normal;
		color: var(--ink);
	}
	.mark.given {
		background: var(--blue);
		color: var(--ink-inverse);
	}
	.mark.refused {
		background: var(--bad-bg);
		color: var(--bad);
		border: 1px solid var(--bad);
	}
	.mark.held {
		background: var(--lemon-2);
		color: var(--ink);
		border: 1px solid var(--lemon-line);
	}
	.mark.missing {
		border: 2px solid var(--line2);
	}
	.mark.upcoming {
		border: 2px dashed var(--line2);
	}
	.mark.na {
		color: var(--muted);
		font-weight: normal;
	}
	.mark.prn {
		border: 1px solid var(--line2);
		color: var(--ink);
	}
	.mark.prn.zero {
		border-color: transparent;
	}
	.compliance {
		gap: 6px;
	}
	.bar {
		height: 8px;
		background: var(--sky);
		border-radius: 999px;
		overflow: hidden;
	}
	.bar > i {
		display: block;
		height: 100%;
		border-radius: 999px;
	}
	.bar > i.ok {
		background: var(--ok);
	}
	.bar > i.caution {
		background: var(--lemon);
	}
	.bar > i.bad {
		background: var(--bad);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13px;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.legend .mark {
		width: 20px;
		height: 20px;
		font-size: 11px;
	}
</style>
