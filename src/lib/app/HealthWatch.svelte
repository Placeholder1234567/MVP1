<script lang="ts">
	// Lomi's health watch (charting-guide.md §3c, frontend-audit.md finding 16):
	// early signs of the Fatal Five and sepsis in the last 14 days of records on
	// this device. Rules: domain/health-watch.ts. Signed notes only; drafts are
	// not yet records.
	import { resolve } from '$app/paths';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import {
		healthWatch,
		WATCH_DAYS,
		WATCH_LABELS,
		watchSummary,
		type WatchHealth,
		type WatchNote
	} from '#lib/domain/index.ts';

	let { clientId }: { clientId?: string } = $props();
	const app = useSession();

	const people = $derived(
		clientId ? app.people.filter((p) => p.id === clientId) : app.currentPeople
	);
	const flagged = $derived.by(() => {
		const now = new Date();
		return people.flatMap((person) => {
			const notes: WatchNote[] = [
				...app.notes
					.filter(
						(n) =>
							n.client_id === person.id && (n.status === 'submitted' || n.status === 'approved')
					)
					.map((n) => ({
						at: n.created_at ?? '',
						text: Object.values(parseJson<Record<string, unknown>>(n.content, {}))
							.filter((v) => typeof v === 'string')
							.join('. ')
					})),
				...app.incidents
					.filter((i) => i.client_id === person.id)
					.map((i) => ({
						at: i.occurred_at ?? i.created_at ?? '',
						text: [i.type, i.description].filter(Boolean).join('. ')
					}))
			];
			const health: WatchHealth[] = app.health
				.filter((h) => h.client_id === person.id)
				.map((h) => ({
					at: h.recorded_at ?? '',
					kind: h.kind ?? '',
					data: parseJson<Record<string, unknown>>(h.data, {})
				}));
			const summary = watchSummary(healthWatch(notes, health, now));
			return summary.length ? [{ person, summary }] : [];
		});
	});
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<section class="card pad stack watch" aria-labelledby="health-watch-title">
	<div class="head">
		<span class="orb" aria-hidden="true">◒</span>
		<div>
			<h2 id="health-watch-title">Lomi’s health watch</h2>
			<p class="muted">
				Early signs of the Fatal Five (aspiration, bowel obstruction, dehydration, GERD, seizures)
				and sepsis in the last {WATCH_DAYS} days of records. Not a diagnosis: check on the person and
				follow your agency’s protocol.
			</p>
		</div>
	</div>
	{#each flagged as { person, summary } (person.id)}
		<article class="person" aria-label={person.name ?? 'Person'}>
			{#if !clientId}<a href={resolve('/(app)/dashboard/people/[id]', { id: person.id })}
					><b>{person.name}</b></a
				>{/if}
			<ul>
				{#each summary as item (item.condition)}
					<li>
						<span class="pill bad"
							>{WATCH_LABELS[item.condition]}{item.count > 1 ? ` ×${item.count}` : ''}</span
						>
						<span class="evidence">{day(item.latest.at)} · {item.latest.reason}</span>
					</li>
				{/each}
			</ul>
		</article>
	{:else}
		<p class="muted" role="status">
			No warning signs in the last {WATCH_DAYS} days{clientId ? '' : ' for this home'}.
		</p>
	{/each}
</section>

<style>
	.head {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.head h2,
	.head p {
		margin: 0;
	}
	.orb {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--lemon);
		color: #1c1b4b;
		font-size: 26px;
	}
	.person {
		border-top: 1px solid var(--line);
		padding-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.person ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.person li {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: baseline;
	}
	.pill.bad {
		background: var(--bad-bg);
		color: var(--bad);
	}
	.evidence {
		font-size: 14px;
		color: var(--muted);
		overflow-wrap: anywhere;
	}
</style>
