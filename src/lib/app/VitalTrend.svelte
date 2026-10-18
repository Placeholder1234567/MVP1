<script lang="ts">
	// One vital sign over time (frontend-spec-3.md §5.5 "Line Chart"): pure SVG,
	// a shaded normal range where Guad has alert limits, out-of-range points in
	// red, and the values in the accessible label.
	import { trendDomain, type TrendPoint, type TrendSeries } from '#lib/domain/vital-trend.ts';

	let {
		series,
		points,
		label
	}: { series: TrendSeries; points: TrendPoint[]; label: (iso: string) => string } = $props();

	const W = 320;
	const H = 120;
	const PAD = 8;
	const domain = $derived(trendDomain(points, series.band));
	const y = (v: number) =>
		H - PAD - ((v - domain[0]) / (domain[1] - domain[0] || 1)) * (H - 2 * PAD);
	const x = (i: number) =>
		points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - 2 * PAD);
	const latest = $derived(points.at(-1));
	const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${series.unit}`;
	const described = $derived(
		`${series.label}: ${points.map((p) => `${fmt(p.value)} on ${label(p.at)}${p.flagged ? ' (outside range)' : ''}`).join('; ')}`
	);
</script>

<article class="card pad stack trend" aria-label={series.label}>
	<div class="spread">
		<b>{series.label}</b>
		{#if latest}<span class:bad={latest.flagged}>{fmt(latest.value)}</span>{/if}
	</div>
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={described}>
		{#if series.band}
			<rect
				class="band"
				x="0"
				width={W}
				y={y(series.band[1])}
				height={Math.max(0, y(series.band[0]) - y(series.band[1]))}
			/>
		{/if}
		{#if points.length > 1}
			<polyline class="line" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
		{/if}
		{#each points as p, i (p.at + i)}
			<circle class:flagged={p.flagged} cx={x(i)} cy={y(p.value)} r="3.5"
				><title>{fmt(p.value)} · {label(p.at)}</title></circle
			>
		{/each}
	</svg>
	<div class="spread muted axis">
		<span>{points.length ? label(points[0].at) : ''}</span>
		<span>{points.length > 1 ? label(points.at(-1)!.at) : ''}</span>
	</div>
	<p class="muted note">
		{points.length} reading{points.length === 1 ? '' : 's'}{series.band
			? ` · normal ${series.band[0]}–${series.band[1]} ${series.unit}`
			: ' · no alert limits set'}
	</p>
</article>

<style>
	.trend {
		gap: 8px;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.band {
		fill: var(--ok-bg);
		opacity: 0.6;
	}
	.line {
		fill: none;
		stroke: var(--blue);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	circle {
		fill: var(--blue);
	}
	circle.flagged {
		fill: var(--bad);
	}
	.bad {
		color: var(--bad);
		font-weight: 600;
	}
	.axis,
	.note {
		font-size: 13px;
		margin: 0;
	}
</style>
