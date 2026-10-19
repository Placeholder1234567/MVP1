<script lang="ts">
	// "Update available [Refresh]" (frontend-spec-2.md §8.5): once per update,
	// gone after 10 seconds or when closed; the new version then starts the
	// next time the app opens.
	import { onMount } from 'svelte';
	import { applyUpdate, update, watchForUpdate } from '#lib/pwa/update.svelte.ts';

	let shown = $state(false);
	let dismissed = $state(false);
	let message = $state('');
	onMount(watchForUpdate);

	$effect(() => {
		if (!update.ready || dismissed) return;
		shown = true;
		const timer = setTimeout(() => {
			// Stays up while it is explaining why it couldn't refresh yet.
			if (!message) close();
		}, 10_000);
		return () => clearTimeout(timer);
	});

	function close() {
		shown = false;
		dismissed = true;
	}

	function refresh() {
		if (applyUpdate() === 'unsaved') message = 'Save your draft first, then refresh.';
	}
</script>

{#if shown}<div class="toast update" role="status" data-testid="update-toast">
		{#if message}{message}{:else}Update available{/if}
		<button class="link" onclick={refresh}>Refresh</button>
		<button class="link close" aria-label="Dismiss update notice" onclick={close}>×</button>
	</div>{/if}

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(110px + env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		background: var(--ink);
		color: var(--bg);
		padding: 12px 18px;
		border-radius: 999px;
		font-weight: 600;
		font-size: 14px;
		z-index: 40;
		width: max-content;
		max-width: calc(100vw - 32px);
		text-align: center;
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4);
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.link {
		background: none;
		border: 0;
		padding: 4px;
		min-height: 44px;
		color: var(--lemon);
		font: inherit;
		cursor: pointer;
	}
	/* Dark themes turn the pill light, where lemon text can't be read. */
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .link {
			color: inherit;
			text-decoration: underline;
		}
	}
	:global(:root[data-theme='dark']) .link,
	:global(:root[data-theme='night']) .link {
		color: inherit;
		text-decoration: underline;
	}
	.close {
		color: var(--bg);
		min-width: 44px;
	}
</style>
