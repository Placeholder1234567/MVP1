<script lang="ts">
	import { useSession } from './session.svelte';
	import { recentCoverage, coverageLabel, coverageTimeline } from './coverage-activity';
	import { ELIGIBILITY_REASON_LABEL, SHIFTS } from '#lib/domain/index.ts';
	import type { Database } from '#lib/sync/schema.ts';
	import { trpc } from '#lib/trpc.ts';
	type Detail = Awaited<ReturnType<typeof trpc.coverage.get.query>>;
	const app = useSession();
	// Who each request was offered to; candidates aren't synced, so this loads online.
	let details = $state<Record<string, Detail | 'loading' | 'failed'>>({});
	// Fetched again each time it is opened, so new replies show; the last
	// answer stays on screen while the new one loads.
	async function loadDetail(id: string) {
		if (details[id] === 'loading') return;
		if (!details[id] || details[id] === 'failed') details[id] = 'loading';
		try {
			details[id] = await trpc.coverage.get.query({ id });
		} catch {
			details[id] = 'failed';
		}
	}
	const reasonLabel = (reason: string | null) =>
		(reason && ELIGIBILITY_REASON_LABEL[reason as keyof typeof ELIGIBILITY_REASON_LABEL]) ||
		'Not eligible';
	const repliedAt = (at: Date | string | null) => (at ? timestamp(new Date(at).toISOString()) : '');
	const replyLabel = (c: Detail['candidates'][number]) =>
		c.reply === 'accepted'
			? `Accepted ${repliedAt(c.repliedAt)}`
			: c.reply === 'declined'
				? `Declined ${repliedAt(c.repliedAt)}`
				: 'No reply';
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
		{@const detail = details[request.id]}
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
			<details
				ontoggle={(e) => {
					if ((e.currentTarget as HTMLDetailsElement).open) void loadDetail(request.id);
				}}
			>
				<summary>Who was offered</summary>
				{#if detail === 'loading'}<p class="muted">Loading…</p>
				{:else if detail === 'failed'}<p role="status">
						Could not load who was offered. Check your connection and open this again.
					</p>
				{:else if detail}{#if detail.candidates.length}<ul class="candidates">
							{#each detail.candidates as c (c.profileId)}<li>
									<b>{c.name}</b><span class="muted"
										>{c.eligible ? 'Offered' : reasonLabel(c.reason)}</span
									>{#if c.eligible}<span>{replyLabel(c)}</span>{/if}
								</li>{/each}
						</ul>{:else}<p class="muted">Nobody has been checked for this shift yet.</p>{/if}{/if}
			</details>
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
	.candidates {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
	}
	.candidates li {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		border-top: 1px solid var(--line);
		padding: 8px 0;
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
