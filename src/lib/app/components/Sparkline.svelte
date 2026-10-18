<script lang="ts">
	// Inline SVG sparkline (frontend-spec-3.md §5.5 "Sparkline"): 80 × 24, no
	// axes. The label describes the series in words for screen readers.
	import { sparklineSegments } from '#lib/domain/index.ts';
	let { values, label }: { values: (number | null)[]; label: string } = $props();
	const segments = $derived(sparklineSegments(values, 80, 24, 2));
	const last = $derived(segments.at(-1)?.at(-1));
</script>

<svg class="spark" width="80" height="24" viewBox="0 0 80 24" role="img" aria-label={label}>
	{#each segments as seg, i (i)}
		{#if seg.length === 1}
			<circle cx={seg[0].x} cy={seg[0].y} r="1.5" />
		{:else}
			<polyline points={seg.map((p) => `${p.x},${p.y}`).join(' ')} />
		{/if}
	{/each}
	{#if last}<circle class="end" cx={last.x} cy={last.y} r="2" />{/if}
</svg>

<style>
	.spark {
		display: block;
		overflow: visible;
	}
	polyline {
		fill: none;
		stroke: var(--blue);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	circle {
		fill: var(--blue);
	}
</style>
