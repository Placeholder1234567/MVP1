<script lang="ts">
	import { onMount } from 'svelte';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import { CLOCK_KIND_LABEL, hoursText, myHours } from '#lib/domain/my-hours.ts';
	import { dayLabel } from '#lib/domain/time.ts';

	const app = useSession();
	let now = $state(new Date());
	// Why a supervisor added an entry; not synced, so it loads when online.
	let reasons = $state<Record<string, string>>({});
	const hours = $derived(
		myHours(
			app.clocks.filter((c) => c.profile_id === app.user.profileId),
			now,
			app.user.timeZone
		)
	);
	const time = (d: Date) =>
		d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: app.user.timeZone });
	const homeName = (id: string | null) => app.homes.find((h) => h.id === id)?.name ?? 'Home';

	onMount(() => {
		const tick = setInterval(() => (now = new Date()), 60_000);
		if (navigator.onLine)
			trpc.clock.list
				.query({
					profileId: app.user.profileId,
					dateRange: { from: new Date(Date.now() - 60 * 86400000), to: new Date() }
				})
				.then((rows) => {
					reasons = Object.fromEntries(
						rows.filter((r) => r.manual_override && r.reason).map((r) => [r.id, r.reason!])
					);
				})
				.catch(() => {});
		return () => clearInterval(tick);
	});
</script>

<section class="card pad stack" aria-labelledby="my-hours">
	<h2 id="my-hours">My hours</h2>
	<div class="hours-totals">
		<p><span class="muted s13">This week</span><br /><b>{hoursText(hours.thisWeek)}</b></p>
		<p><span class="muted s13">Last week</span><br /><b>{hoursText(hours.lastWeek)}</b></p>
	</div>
	{#if hours.entries.length}<ul class="hours-list" aria-label="Recent clock records">
			{#each hours.entries as entry (entry.id)}<li>
					<div class="row">
						<span
							><b>{dayLabel(entry.day)}</b> · {homeName(entry.homeId)}<br /><span class="muted s13"
								>{time(entry.clockIn)} – {entry.clockOut ? time(entry.clockOut) : 'now'}</span
							></span
						><b>{hoursText(entry.hours)}</b>
					</div>
					<span class="pill" class:warn={entry.kind === 'manual' || entry.kind === 'unverified'}
						>{CLOCK_KIND_LABEL[entry.kind]}</span
					>{#if reasons[entry.id]}<p class="muted s13">Reason: {reasons[entry.id]}</p>{/if}
				</li>{/each}
		</ul>{:else}<p class="muted">No clock records yet.</p>{/if}
</section>

<style>
	.hours-totals {
		display: flex;
		gap: 24px;
	}
	.hours-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.hours-list li {
		display: grid;
		gap: 4px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--line);
	}
	.hours-list li:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.pill {
		justify-self: start;
	}
</style>
