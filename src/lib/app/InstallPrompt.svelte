<script lang="ts">
	// Install prompts on Today (frontend-spec-2.md §8.4): a banner where the
	// browser can install the app, step-by-step instructions on iPhone/iPad
	// Safari, and a one-time welcome the first time the installed app opens.
	// When to show which is installPrompt() in domain/pwa.ts.
	import { onMount, tick } from 'svelte';
	import { installPrompt, isIosSafari, type InstallState } from '#lib/domain/pwa.ts';
	import { install, countVisit } from '#lib/pwa/install.svelte.ts';
	import { updateInstallState } from '#lib/pwa/install-state.ts';

	let saved = $state<InstallState | null>(null);
	let env = $state({ standalone: false, mobile: false, iosSafari: false });
	let dialog = $state<HTMLDialogElement>();
	const kind = $derived(
		saved &&
			installPrompt(saved, {
				...env,
				canPrompt: !!install.offer,
				closedThisSession: install.closed
			})
	);

	onMount(async () => {
		env = {
			standalone:
				matchMedia('(display-mode: standalone)').matches ||
				(navigator as { standalone?: boolean }).standalone === true,
			mobile: matchMedia('(pointer: coarse)').matches,
			iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints)
		};
		saved = await countVisit();
	});

	// The sheet and welcome are modal: focus stays inside until closed.
	$effect(() => {
		if ((kind === 'ios-sheet' || kind === 'welcome') && dialog && !dialog.open)
			void tick().then(() => dialog?.showModal());
	});

	async function save(change: Partial<InstallState>) {
		saved = (await updateInstallState(() => change)) ?? (saved && { ...saved, ...change });
	}
	// Each choice is saved before the banner goes, so a reload straight after
	// can't bring it back.
	let busy = false;
	async function add() {
		const offer = install.offer;
		if (!offer || busy) return;
		busy = true;
		await offer.prompt();
		const { outcome } = await offer.userChoice;
		await save(
			outcome === 'accepted' ? { installed: true } : { dismissals: (saved?.dismissals ?? 0) + 1 }
		);
		install.offer = null;
		install.closed = true;
	}
	async function dismiss() {
		if (busy) return;
		busy = true;
		await save({ dismissals: (saved?.dismissals ?? 0) + 1 });
		install.closed = true;
	}
	async function closeDialog(change: Partial<InstallState>) {
		await save(change);
		install.closed = true;
		dialog?.close();
	}
</script>

{#if kind === 'banner'}
	<div class="callout info install" role="region" aria-label="Install Guad">
		<p>Add Guad to your home screen for the best experience.</p>
		<div class="row-actions">
			<button class="btn sm" onclick={add}>Add to home screen</button>
			<button class="iconbtn" aria-label="Not now" onclick={dismiss}>×</button>
		</div>
	</div>
{:else if kind === 'ios-sheet'}
	<!-- Escape closes for this session; "Got it" closes for good. -->
	<dialog
		class="sheet"
		bind:this={dialog}
		aria-labelledby="install-ios-title"
		onclose={() => (install.closed = true)}
	>
		<span class="handle" aria-hidden="true"></span>
		<h2 id="install-ios-title">Add Guad to your home screen</h2>
		<ol>
			<li>Tap the Share button at the bottom of Safari.</li>
			<li>Scroll down and tap “Add to Home Screen”.</li>
			<li>Tap “Add” in the top right.</li>
		</ol>
		<button class="btn" onclick={() => closeDialog({ iosDone: true })}>Got it</button>
	</dialog>
{:else if kind === 'welcome'}
	<dialog
		class="sheet welcome"
		bind:this={dialog}
		aria-labelledby="install-welcome-title"
		onclose={() => void save({ welcomed: true })}
	>
		<span class="orb" aria-hidden="true">◒</span>
		<h2 id="install-welcome-title">Welcome to Guad</h2>
		<p class="muted">You’re using the app version. It works offline and loads instantly.</p>
		<button class="btn" onclick={() => closeDialog({ welcomed: true })}>Get started</button>
	</dialog>
{/if}

<style>
	.install {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
	}
	.install p {
		margin: 0;
		flex: 1 1 200px;
	}
	.row-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.sheet {
		margin: auto auto 0;
		width: 100%;
		max-width: 560px;
		border: 0;
		border-radius: 24px 24px 0 0;
		padding: 12px 24px 28px;
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow);
	}
	.sheet[open] {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.sheet::backdrop {
		background: rgba(28, 27, 75, 0.45);
	}
	.sheet h2 {
		margin: 0;
	}
	.sheet ol {
		margin: 0;
		padding-left: 22px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.handle {
		align-self: center;
		width: 40px;
		height: 4px;
		border-radius: 999px;
		background: var(--line2);
	}
	.welcome {
		margin: auto;
		width: calc(100% - 32px);
		border-radius: 24px;
		text-align: center;
		align-items: center;
		max-width: 420px;
	}
	.orb {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		background: var(--lemon);
		color: var(--ink);
		border-radius: 50%;
		font-size: 26px;
	}
	.welcome .btn {
		align-self: stretch;
	}
	@media (prefers-reduced-motion: no-preference) {
		.sheet[open] {
			animation: sheet-in 200ms ease-out;
		}
	}
	@keyframes sheet-in {
		from {
			transform: translateY(24px);
			opacity: 0;
		}
	}
</style>
