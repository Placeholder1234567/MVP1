<script lang="ts">
	// Loading skeleton (frontend-spec-3.md §5 "Loading Skeleton"): grey shapes in
	// the geometry of the content that's coming, so the page doesn't jump when
	// it arrives. Screen readers hear one "Loading" status instead.
	let {
		kind = 'rows',
		count = 3,
		label = 'Loading'
	}: { kind?: 'rows' | 'cards' | 'stats'; count?: number; label?: string } = $props();
</script>

<div class="skeleton {kind}" role="status" aria-label={label}>
	{#each { length: count } as _, i (i)}
		{#if kind === 'rows'}
			<div class="row" aria-hidden="true">
				<span class="bone circle"></span>
				<span class="lines">
					<span class="bone" style:width="120px"></span>
					<span class="bone short" style:width="180px"></span>
				</span>
				<span class="bone pill"></span>
			</div>
		{:else if kind === 'stats'}
			<div class="card pad stat" aria-hidden="true">
				<span class="bone" style:width="100px"></span>
				<span class="bone big"></span>
			</div>
		{:else}
			<div class="bone card-bone" aria-hidden="true"></div>
		{/if}
	{/each}
</div>

<style>
	.skeleton {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.skeleton.rows {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 4px 0;
	}
	.skeleton.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
	}
	.skeleton.cards {
		gap: 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
	}
	.lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}
	.bone {
		display: block;
		height: 14px;
		max-width: 100%;
		border-radius: 4px;
		background: linear-gradient(90deg, var(--line) 25%, var(--sky) 50%, var(--line) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite ease-in-out;
	}
	.bone.short {
		height: 12px;
	}
	.circle {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		flex: none;
	}
	.pill {
		width: 60px;
		height: 22px;
		border-radius: 999px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.big {
		width: 80px;
		height: 30px;
	}
	.card-bone {
		height: 120px;
		border-radius: 18px;
	}
	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bone {
			animation: none;
			opacity: 0.5;
		}
	}
</style>
