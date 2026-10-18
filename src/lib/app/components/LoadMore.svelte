<script lang="ts">
	// "Load more" for lists over 25 items (frontend-spec-3.md §5 Pagination):
	// a button at the bottom, never infinite scroll.
	let { shown, total, onmore }: { shown: number; total: number; onmore: () => void } = $props();
</script>

{#if total > shown}<div class="stack load-more">
		<p class="muted s13" role="status">Showing {shown} of {total}</p>
		<button type="button" class="btn sec full" onclick={onmore}>Load more</button>
	</div>{/if}

<style>
	.load-more {
		align-items: center;
		text-align: center;
	}
	.full {
		width: 100%;
	}
</style>
