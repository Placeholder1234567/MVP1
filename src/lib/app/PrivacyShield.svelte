<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { privacyLockDue } from '#lib/domain/privacy.ts';
	import { unwrapKey, unwrapOfflineKey, WrongPinError } from '#lib/sync/device-key.ts';
	let {
		profileId,
		offline = false,
		onLock,
		onUnlock,
		onReady,
		onPrivacyChange,
		onLockedOut,
		children
	}: {
		profileId: string;
		offline?: boolean;
		onLock: () => Promise<void>;
		/** onWait: another tab has the database open; this one opens when it's free */
		onUnlock: (key: Uint8Array, onWait: () => void) => Promise<void>;
		onReady: (lock: () => Promise<void>) => void;
		onPrivacyChange?: (masked: boolean) => void;
		/** After the last wrong PIN (the wrapped key is gone) */
		onLockedOut?: () => Promise<void>;
		children: Snippet;
	} = $props();
	let hidden = $state(false);
	let locked = $state(false);
	let busy = $state(false);
	/** Waiting for another tab to give up the device database. */
	let waiting = $state(false);
	let pin = $state('');
	let error = $state('');
	let lastActivity = Date.now();
	let hiddenAt: number | null = null;
	let closing: Promise<void> = Promise.resolve();
	let alive = true;
	let closeFailed = false;
	let revision = 0;
	$effect(() => {
		onPrivacyChange?.(hidden || locked);
	});
	function requirePin() {
		if (locked) return;
		locked = true;
		revision++;
		pin = '';
		closing = onLock().catch(() => {
			closeFailed = true;
			error = 'Could not finish locking. Reload before continuing.';
		});
	}
	function check() {
		if (privacyLockDue(Date.now(), lastActivity, hiddenAt)) requirePin();
	}
	onMount(() => {
		onReady(async () => {
			requirePin();
			await closing;
		});
		const visibility = () => {
			check();
			hidden = document.hidden;
			if (hidden) {
				hiddenAt ??= Date.now();
				revision++;
				pin = '';
			} else {
				check();
				hiddenAt = null;
			}
		};
		const activity = (event: Event) => {
			const wasLocked = locked;
			check();
			if (!wasLocked && locked) event.stopImmediatePropagation();
			if (event.isTrusted && !hidden && !locked) lastActivity = Date.now();
		};
		const pagehide = () => {
			hidden = true;
			requirePin();
		};
		const pageshow = () => visibility();
		const events = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'];
		for (const event of events)
			window.addEventListener(event, activity, { capture: true, passive: true });
		document.addEventListener('visibilitychange', visibility);
		window.addEventListener('pagehide', pagehide);
		window.addEventListener('pageshow', pageshow);
		const timer = setInterval(check, 1000);
		visibility();
		return () => {
			alive = false;
			clearInterval(timer);
			for (const event of events) window.removeEventListener(event, activity, true);
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('pagehide', pagehide);
			window.removeEventListener('pageshow', pageshow);
		};
	});
	async function unlock(event: SubmitEvent) {
		event.preventDefault();
		if (busy || hidden || !/^\d{6,8}$/.test(pin)) return;
		busy = true;
		error = '';
		const attempt = revision;
		let key: Uint8Array | undefined;
		try {
			await closing;
			if (closeFailed) throw new Error('Lock unavailable');
			key = await (offline ? unwrapOfflineKey(pin, profileId) : unwrapKey(pin, profileId));
			if (!alive || hidden || revision !== attempt) return;
			await onUnlock(key, () => (waiting = true));
			if (!alive || hidden || revision !== attempt) {
				await onLock();
				return;
			}
			lastActivity = Date.now();
			hiddenAt = null;
			locked = false;
		} catch (e) {
			error =
				e instanceof WrongPinError
					? e.message
					: 'Could not unlock. Reconnect or return to sign-in.';
			if (e instanceof WrongPinError && e.attemptsLeft === 0) await onLockedOut?.();
		} finally {
			key?.fill(0);
			pin = '';
			busy = false;
			waiting = false;
		}
	}
</script>

<div hidden={hidden || locked} inert={hidden || locked}>
	{@render children()}
</div>
{#if hidden || locked}
	<main class="unlock-page" aria-label="Privacy lock">
		<div class="card pad stack">
			<span class="wordmark">Guad</span>
			<h1>Workspace locked</h1>
			<p>
				Your work stays here while this page remains open. Saved changes stay encrypted on this
				device.
			</p>
			{#if !hidden}
				<form class="stack" onsubmit={unlock}>
					<label
						>Device PIN<input
							class="input"
							type="password"
							inputmode="numeric"
							autocomplete="off"
							pattern={'[0-9]{6,8}'}
							required
							minlength="6"
							maxlength="8"
							bind:value={pin}
						/></label
					>
					<button class="btn" disabled={busy}>{busy ? 'Opening…' : 'Unlock workspace'}</button>
				</form>
			{/if}
			{#if waiting}<p class="callout" role="status">
					Guad is open in another tab. Lock or close it there and this tab opens by itself.
				</p>{/if}
			{#if error}<p class="callout bad" role="alert">{error}</p>{/if}
			<a class="textbtn" href={resolve('/login')} data-sveltekit-reload>Return to sign-in</a>
		</div>
	</main>
{/if}

<style>
	[hidden] {
		display: none !important;
	}
</style>
