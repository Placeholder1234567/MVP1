<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { closeDb, openDb } from '#lib/sync/db.ts';
	import {
		deviceId,
		hasWrappedKey,
		unwrapKey,
		wrapKey,
		verifyOfflineAccess,
		WrongPinError
	} from '#lib/sync/device-key.ts';
	import { signOutEverywhere } from '#lib/auth/firebase.ts';
	import { trpc } from '#lib/trpc.ts';
	import { clearShellCaches } from '#lib/pwa/cache.ts';
	import { provideSession } from '#lib/app/session.svelte.ts';
	import type { LayoutProps } from './$types';
	let { data, children }: LayoutProps = $props();
	const app = provideSession(untrack(() => data.user));
	let step = $state<'checking' | 'set-pin' | 'enter-pin' | 'open'>('checking');
	let pin = $state('');
	let again = $state('');
	let message = $state('');
	let busy = $state(false);
	let key: Uint8Array | undefined;
	const nav = $derived(
		data.user.role === 'caregiver'
			? [
					{ href: '/today', label: 'Today' },
					{ href: '/notes', label: 'Notes' },
					{ href: '/shifts', label: 'Shifts' },
					{ href: '/me', label: 'Me' }
				]
			: [
					{ href: '/dashboard', label: 'Overview' },
					{ href: '/dashboard/notes', label: 'Review notes' },
					{ href: '/today', label: 'Care records' },
					{ href: '/shifts', label: 'Schedule' },
					{ href: '/dashboard/timesheets', label: 'Timesheets' },
					{ href: '/dashboard/intake', label: 'Intake' },
					{ href: '/messages', label: 'Messages' },
					{ href: '/me', label: 'Me' }
				]
	);
	async function fetchKey() {
		const result = await trpc.device.key.mutate({ deviceId: await deviceId(app.user.profileId) });
		key = Uint8Array.from(atob(result.key.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
			c.charCodeAt(0)
		);
		step = 'set-pin';
	}
	onMount(() => {
		let alive = true;
		void (async () => {
			try {
				if (await hasWrappedKey(app.user.profileId)) {
					if (alive) step = 'enter-pin';
				} else await fetchKey();
			} catch {
				if (alive) message = 'Connect to the internet to set up this device, then try again.';
			}
		})();
		return () => {
			alive = false;
			app.dispose();
			void closeDb();
			key?.fill(0);
		};
	});
	async function unlock(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		if (!/^\d{6,8}$/.test(pin)) {
			message = 'Use 6 to 8 digits.';
			return;
		}
		if (step === 'set-pin' && pin !== again) {
			message = "The PINs don't match.";
			return;
		}
		busy = true;
		try {
			const unlocked = step === 'set-pin' ? key! : await unwrapKey(pin, app.user.profileId);
			if (step === 'set-pin') await wrapKey(unlocked, pin, app.user.profileId);
			const database = await openDb(unlocked, app.user.profileId);
			app.connect(database);
			// Only a fresh server response can renew saved access; an offline PIN unlock cannot.
			void Promise.all([trpc.auth.me.query(), trpc.agency.get.query()])
				.then(async ([profile, agency]) => {
					if (
						profile.id !== app.user.profileId ||
						profile.agencyId !== app.user.agencyId ||
						agency.id !== profile.agencyId
					)
						return;
					const snapshot = {
						profileId: profile.id,
						agencyId: profile.agencyId,
						name: profile.name,
						role: profile.role,
						homeIds: profile.homeIds,
						medCertified: profile.medCertified,
						timeZone: agency.timezone
					};
					await database.execute(
						'INSERT OR REPLACE INTO offline_sessions (id, user_json) VALUES (?, ?)',
						[profile.id, JSON.stringify(snapshot)]
					);
					await verifyOfflineAccess(profile.id);
				})
				.catch(() => {});
			unlocked.fill(0);
			key = undefined;
			step = 'open';
		} catch (e) {
			message =
				e instanceof WrongPinError ? e.message : 'Could not unlock this device. Please try again.';
			if (e instanceof WrongPinError && e.attemptsLeft === 0) await fetchKey().catch(() => {});
		} finally {
			pin = '';
			again = '';
			busy = false;
		}
	}
	async function lock() {
		app.dispose();
		await closeDb();
		step = 'enter-pin';
	}
	async function signOut() {
		if (app.db) {
			const queue = await app.db.getUploadQueueStats();
			if (queue.count) {
				await lock();
				message = 'This device is locked. Unlock and let your changes sync before signing out.';
				return;
			}
			await app.db.disconnectAndClear();
		}
		app.dispose();
		await closeDb();
		await signOutEverywhere();
		await clearShellCaches();
		await goto(resolve('/login'), { refreshAll: true });
	}
	app.lock = lock;
	app.signOut = signOut;
</script>

{#if step !== 'open'}
	<main class="unlock-page">
		<div class="card pad stack">
			<a class="wordmark" href={resolve('/')}>Guad<span class="lemon-dot">●</span></a>
			<h1>
				{step === 'set-pin'
					? 'Make this device yours'
					: step === 'enter-pin'
						? 'Welcome back'
						: 'Opening Guad'}
			</h1>
			<p class="muted">
				{step === 'set-pin'
					? 'Choose a PIN to keep care records private on this device.'
					: 'Enter your device PIN to open your saved care records.'}
			</p>
			{#if step !== 'checking'}<form class="stack" onsubmit={unlock}>
					<label
						>Device PIN<input
							class="input"
							type="password"
							inputmode="numeric"
							autocomplete={step === 'set-pin' ? 'new-password' : 'current-password'}
							required
							minlength="6"
							maxlength="8"
							bind:value={pin}
						/></label
					>
					{#if step === 'set-pin'}<label
							>Confirm PIN<input
								class="input"
								type="password"
								inputmode="numeric"
								autocomplete="new-password"
								required
								bind:value={again}
							/></label
						>{/if}
					<button class="btn" disabled={busy}
						>{busy ? 'Opening…' : step === 'set-pin' ? 'Save PIN and open' : 'Unlock'}</button
					>
				</form>{/if}
			{#if message}<p role="alert" class="callout bad">{message}</p>
				<button class="textbtn" onclick={() => location.reload()}>Try again</button>{/if}
			<button class="textbtn" onclick={signOut}>Sign out</button>
		</div>
	</main>
{:else}
	<a class="skip-link" href="#main">Skip to content</a>
	<div class="app-shell">
		<aside class="sidebar">
			<a class="wordmark" href={resolve('/')}>Guad<span class="lemon-dot">●</span></a>
			<p class="eyebrow">Your workspace</p>
			<nav aria-label="Main navigation">
				{#each nav as item (item.href)}<a
						href={resolve(('/(app)' + item.href) as '/(app)/today')}
						aria-current={page.url.pathname === item.href ? 'page' : undefined}>{item.label}</a
					>{/each}
			</nav>
			<div class="sidebar-bottom">
				<b>{data.user.name}</b><span class="muted">{data.user.role}</span><button
					class="textbtn"
					onclick={lock}>Lock device</button
				>
			</div>
		</aside>
		<div class="workspace">
			<header class="topbar">
				<a class="wordmark mobile-brand" href={resolve('/')}>Guad</a>
				<label class="home-select"
					><span class="sr">Current home</span><select
						class="input"
						bind:value={app.homeId}
						aria-label="Current home"
						>{#each app.homes as home (home.id)}<option value={home.id}>{home.name}</option
							>{/each}</select
					></label
				>
				<span class="sync-label" role="status" data-testid="sync-status"
					>{app.pending ? `${app.pending} changes waiting to sync` : app.status}</span
				>
				<a class="textbtn" href={resolve('/(app)/messages')}>Team messages</a>
				<a
					class="textbtn"
					href={resolve('/(app)/notifications')}
					aria-label={`Alerts, ${app.unreadAlerts} unread`}
					>Alerts{app.unreadAlerts ? ` (${app.unreadAlerts})` : ''}</a
				>
			</header>
			<main id="main" class="main-content" tabindex="-1">
				{#if app.error}<p class="callout bad" role="alert">{app.error}</p>{/if}
				{#if app.failed.length}<div class="callout bad" role="alert">
						<b>{app.failed.length} changes need attention</b>
						<p>
							Your server did not accept these changes. Keep this device unlocked while you review
							them.
						</p>
						<ul>
							{#each app.failed as f (f.id)}<li>{f.message}</li>{/each}
						</ul>
					</div>{/if}
				{@render children()}
			</main>
		</div>
		<nav class="mobile-nav" aria-label="Mobile navigation">
			{#each data.user.role === 'caregiver' ? nav : [nav[0], nav[1], nav.find((item) => item.href === '/shifts')!, nav.find((item) => item.href === '/me')!] as item (item.href)}<a
					href={resolve(('/(app)' + item.href) as '/(app)/today')}
					aria-current={page.url.pathname === item.href ? 'page' : undefined}>{item.label}</a
				>{/each}
		</nav>
	</div>
{/if}
