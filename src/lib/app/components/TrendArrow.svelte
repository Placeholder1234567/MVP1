<script lang="ts">
	// Trend arrow (frontend-spec-3.md §5.5 "Trend Arrow"): the last two weeks
	// against the two before. Green is better, red worse, grey steady, so the
	// colour depends on whether a higher number is good for this measure.
	import { trendChange, trendText } from '#lib/domain/index.ts';
	let {
		values,
		higherIsBetter = true,
		label
	}: { values: (number | null)[]; higherIsBetter?: boolean; label: string } = $props();
	const change = $derived(trendChange(values, higherIsBetter));
	const words = $derived(
		change
			? change.direction === 'steady'
				? 'steady'
				: `${change.direction === 'up' ? 'up' : 'down'} ${change.percent === null ? 'from none' : `${Math.abs(change.percent)}%`}, ${change.tone === 'ok' ? 'better' : 'worse'}`
			: ''
	);
</script>

{#if change}
	<span class="trend {change.tone}" aria-label="{label}: {words} than the two weeks before">
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
			{#if change.direction === 'up'}<path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
			{:else if change.direction === 'down'}<path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
			{:else}<path d="M3 8h10M8.5 3.5 13 8l-4.5 4.5" />{/if}
		</svg>{trendText(change)}
	</span>
{/if}

<style>
	.trend {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
	}
	.trend.ok {
		color: var(--ok);
	}
	.trend.bad {
		color: var(--bad);
	}
	.trend.muted {
		color: var(--muted);
	}
	path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
