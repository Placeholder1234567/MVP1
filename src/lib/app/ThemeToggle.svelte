<script lang="ts">
	// Light / Dark / Auto in the app bar (frontend-spec-1.md §10.1): one tap,
	// not buried in settings. Applies at once on this device, then saves to
	// user_settings.theme so it follows the person to other devices.
	import { THEMES, themeAttribute, type Theme } from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';
	import { useSession } from './session.svelte';

	const app = useSession();
	let message = $state('');
	// Auto follows the device setting.
	const labels: Record<Theme, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' };

	// The page follows the chosen theme; auto leaves it to the device setting.
	$effect(() => {
		const root = document.documentElement;
		const attribute = themeAttribute(app.theme);
		if (attribute) root.dataset.theme = attribute;
		else delete root.dataset.theme;
	});

	async function choose(theme: Theme) {
		if (theme === app.theme) return;
		app.themeChoice = theme;
		message = '';
		try {
			await trpc.auth.setTheme.mutate({ theme });
		} catch {
			message = 'Saved on this device only. Connect to keep it on your other devices.';
		}
	}
</script>

<div class="seg theme" role="group" aria-label="Display theme">
	{#each THEMES as theme (theme)}
		<button type="button" aria-pressed={app.theme === theme} onclick={() => choose(theme)}
			>{labels[theme]}</button
		>
	{/each}
</div>
{#if message}<span class="sr" role="status">{message}</span>{/if}

<style>
	.theme {
		padding: 3px;
		gap: 2px;
		border-radius: 12px;
	}
	.theme button {
		min-height: 36px;
		padding: 0 10px;
		font-size: 13px;
		border-radius: 9px;
	}
</style>
