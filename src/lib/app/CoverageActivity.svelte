<script lang="ts">
	import { useSession } from './session.svelte';
	import { recentCoverage, coverageLabel, coverageTimeline } from './coverage-activity';
	import { SHIFTS } from '#lib/domain/index.ts';
	import type { Database } from '#lib/sync/schema.ts';
	const app = useSession();
	let steps = $state<Database['coverage_steps'][]>([]);
	let scope = $state('');
	let failed = $state(false);
	const requests = $derived(recentCoverage(app.coverage, app.homeId));
	$effect(() => {
		const db = app.db;
		const home = app.homeId;
		const abort = new AbortController();
		steps = [];
		scope = home;
		failed = false;
		if (db && home)
			db.watch(
				'SELECT * FROM coverage_steps WHERE home_id = ? AND agency_id = ? ORDER BY occurred_at, id',
				[home, app.user.agencyId],
				{
					onResult: (result) => {
						if (!abort.signal.aborted) {
							failed = false;
							steps = (result.rows?._array ?? []) as Database['coverage_steps'][];
						}
					},
					onError: () => {
						if (!abort.signal.aborted) failed = true;
					}
				},
				{ signal: abort.signal }
			);
		return () => abort.abort();
	});
	function timestamp(value: string | null) {
		const date = new Date(value ?? '');
		return Number.isFinite(date.getTime())
			? date.toLocaleString(undefined, {
					timeZone: app.user.timeZone,
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				})
			: 'Time unavailable';
	}
</script>

<section class="stack" aria-label="Coverage activity">
	<h2>Coverage activity</h2>
	<p class="muted">
		The six most recent saved requests for this home. This device keeps recent activity from the
		last seven days, not a complete history. Times use {app.user.timeZone}.
	</p>
	{#if failed}<p role="status">
			Could not read the saved timeline. Lock and unlock this device to try again.
		</p>{/if}
	{#each requests as request (request.id)}
		{@const shift = SHIFTS.find((s) => s.key === request.shift)}
		{@const events = scope === app.homeId ? coverageTimeline(steps, app.homeId, request.id) : []}
		<article class="card pad stack" aria-label="Coverage request">
			<div class="spread">
				<h3>
					{request.day} · {shift?.label ?? 'Shift'}{#if shift}
						· {shift.start}–{shift.end}{/if}
				</h3>
				<span class="pill"
					>{coverageLabel(
						request.status,
						app.staff.find((s) => s.id === request.filled_by)?.name ?? undefined
					)}</span
				>
			</div>
			<p>
				{request.called_out_by
					? `${app.staff.find((s) => s.id === request.called_out_by)?.name ?? 'Staff member'} called out`
					: 'Open shift'}{#if request.reason}
					· {request.reason}{/if}
			</p>
			{#if events.length}<ol class="timeline">
					{#each events as event (event.id)}<li>
							<time datetime={event.occurred_at ?? event.created_at ?? undefined}
								>{timestamp(event.occurred_at ?? event.created_at)}</time
							><span>{event.description || 'Update recorded'}</span>
						</li>{/each}
				</ol>{:else}<p class="muted">
					No timeline events saved on this device yet. Reconnect to receive available updates.
				</p>{/if}
		</article>
	{:else}<p class="card pad">
			No recent coverage requests saved for this home. Callouts and posted open shifts appear here
			after sync.
		</p>{/each}
</section>

<style>
	.timeline {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.timeline li {
		display: grid;
		grid-template-columns: minmax(0, 150px) minmax(0, 1fr);
		gap: 12px;
		border-top: 1px solid var(--line);
		padding: 12px 0;
		overflow-wrap: anywhere;
	}
	time {
		color: var(--muted);
	}
	h3,
	p {
		overflow-wrap: anywhere;
	}
	@media (max-width: 600px) {
		.timeline li {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
