<script lang="ts">
	// "Heading into evening? Switch to dark mode." (frontend-spec-1.md §10.1):
	// a non-blocking suggestion from 8pm for people on Auto whose device shows
	// light. It never switches by itself; "Not now" hides it for the day on
	// every device (user_settings.disclosure).
	import { localTime, parseDisclosure, suggestDark } from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';
	import { useSession } from './session.svelte';

	const app = useSession();
	let now = $state(new Date());
	let deviceDark = $state(false);
	let hidden = $state(false);
	$effect(() => {
		const media = matchMedia('(prefers-color-scheme: dark)');
		deviceDark = media.matches;
		const change = () => (deviceDark = media.matches);
		media.addEventListener('change', change);
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => {
			media.removeEventListener('change', change);
			clearInterval(timer);
		};
	});
	const local = $derived(localTime(now, app.user.timeZone));
	const show = $derived(
		!hidden &&
			suggestDark({
				choice: app.theme,
				deviceDark,
				hour: Number(local.hour),
				today: local.day,
				dismissedOn: parseDisclosure(app.settings?.disclosure).darkSuggestionDay
			})
	);

	async function switchToDark() {
		hidden = true;
		app.themeChoice = 'dark';
		await trpc.auth.setTheme.mutate({ theme: 'dark' }).catch(() => {});
	}
	async function notNow() {
		hidden = true;
		await trpc.auth.setDisclosure.mutate({ darkSuggestionDay: local.day }).catch(() => {});
	}
</script>

{#if show}<div class="callout info evening" role="status">
		<span class="grow">Heading into evening? Switch to dark mode.</span>
		<button type="button" class="btn sec" onclick={switchToDark}>Switch to dark</button>
		<button type="button" class="textbtn" onclick={notNow}>Not now</button>
	</div>{/if}

<style>
	.evening {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
</style>
