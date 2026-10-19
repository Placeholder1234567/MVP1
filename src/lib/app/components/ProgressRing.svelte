<script lang="ts">
	// SVG donut (frontend-spec-3.md §5.5 "Progress Ring"). Goal thresholds:
	// 80% and up green, 50–79% lemon, under 50% red; the compliance score uses
	// 90 and 70. The number in the middle carries the value, so the colour is
	// never the only signal.
	let {
		percent,
		label,
		size = 48,
		thresholds = [80, 50]
	}: {
		percent: number;
		label: string;
		size?: 48 | 72;
		thresholds?: readonly [number, number];
	} = $props();
	const stroke = 4;
	const r = $derived(size / 2 - stroke);
	const circumference = $derived(2 * Math.PI * r);
	const value = $derived(Math.max(0, Math.min(100, percent)));
	const dash = $derived((circumference * value) / 100);
	const tone = $derived(value >= thresholds[0] ? 'ok' : value >= thresholds[1] ? 'mid' : 'bad');
</script>

<svg
	class="ring {tone}"
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	role="img"
	aria-label={label}
>
	<circle class="track" cx={size / 2} cy={size / 2} {r} stroke-width={stroke} />
	<circle
		class="arc"
		cx={size / 2}
		cy={size / 2}
		{r}
		stroke-width={stroke}
		stroke-dasharray="{dash} {circumference - dash}"
		transform="rotate(-90 {size / 2} {size / 2})"
	/>
	<text
		x="50%"
		y="50%"
		dominant-baseline="central"
		text-anchor="middle"
		font-size={size === 72 ? 18 : 14}>{Math.round(value)}%</text
	>
</svg>

<style>
	.ring {
		flex: none;
	}
	circle {
		fill: none;
	}
	.track {
		stroke: var(--sky);
	}
	.arc {
		stroke-linecap: round;
	}
	.ok .arc {
		stroke: var(--ok);
	}
	.mid .arc {
		stroke: var(--lemon);
	}
	.bad .arc {
		stroke: var(--bad);
	}
	text {
		fill: var(--ink);
		font-weight: 600;
	}
</style>
