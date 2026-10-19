<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import PrivacyShield from '#lib/app/PrivacyShield.svelte';
	import PushNotice from '#lib/app/PushNotice.svelte';
	import UpgradeDialog from '#lib/app/UpgradeDialog.svelte';
	import ThemeToggle from '#lib/app/ThemeToggle.svelte';
	import EveningSuggestion from '#lib/app/EveningSuggestion.svelte';
	import { stopWebPush } from '#lib/pwa/web-push.ts';
	import InstallCard from '#lib/app/InstallCard.svelte';
	// Catches the browser's install offer early; Today's banner shows it.
	import '#lib/pwa/install.svelte.ts';
	import CommandPalette from '#lib/app/CommandPalette.svelte';
	import { inspectDevice, deviceIssue } from '#lib/pwa/readiness.ts';
	import { page } from '$app/state';
	import { goto, onNavigate } from '$app/navigation';
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
	import { localTime } from '#lib/domain/time.ts';
	import { openShiftCount } from '#lib/domain/shifts.ts';
	import { overviewAttention } from '#lib/domain/compliance.ts';
	import { backlogWarning, storageWarning, type DeviceWarning } from '#lib/domain/sync-backlog.ts';
	import type { LayoutProps } from './$types';
	let { data, children }: LayoutProps = $props();
	const app = provideSession(untrack(() => data.user));
	// Page transitions (frontend-spec-3.md item 26): the main area slides in from
	// the right for a sub-screen and cross-fades otherwise. Skipped where the
	// browser can't, or the person asked for reduced motion.
	onNavigate((nav) => {
		if (
			!document.startViewTransition ||
			matchMedia('(prefers-reduced-motion: reduce)').matches ||
			nav.to?.url.pathname === nav.from?.url.pathname
		)
			return;
		const from = nav.from?.url.pathname ?? '';
		document.documentElement.dataset.nav =
			nav.to && from && nav.to.url.pathname.startsWith(from + '/') ? 'forward' : 'fade';
		return new Promise((ready) => {
			document.startViewTransition(async () => {
				ready();
				await nav.complete;
			});
		});
	});
	let step = $state<'checking' | 'set-pin' | 'enter-pin' | 'open'>('checking');
	let pin = $state('');
	let again = $state('');
	let message = $state('');
	let busy = $state(false);
	/** Another tab has the device database open; this one opens when it's free. */
	let waiting = $state(false);
	let unsupported = $state(false);
	let key: Uint8Array | undefined;
	// Items outside the agency's plan are hidden, not greyed out (entitlements.md §7).
	const nav = $derived(
		(data.user.role === 'caregiver'
			? [
					{ href: '/today', label: 'Today' },
					{ href: '/notes', label: 'Notes', feature: 'charting' },
					{ href: '/shifts', label: 'Shifts', feature: 'scheduling' },
					{ href: '/me', label: 'Me' }
				]
			: [
					// Grouped as in frontend-spec-3.md §3 "Sidebar Sections".
					{ href: '/dashboard', label: 'Overview', section: 'Today' },
					{ href: '/shifts', label: 'Schedule', feature: 'scheduling', section: 'Today' },
					{ href: '/messages', label: 'Messages', feature: 'messaging', section: 'Today' },
					{
						href: '/dashboard/notes',
						label: 'Review notes',
						feature: 'note_review',
						section: 'Care records'
					},
					{ href: '/today', label: 'Care records', feature: 'charting', section: 'Care records' },
					{ href: '/dashboard/mar', label: 'MAR grid', feature: 'mar', section: 'Care records' },
					{
						href: '/controlled',
						label: 'Controlled meds',
						feature: 'mar',
						section: 'Care records'
					},
					{
						href: '/dashboard/goals',
						label: app.labels.goalsNav,
						feature: 'goals',
						section: 'Care records'
					},
					{ href: '/dashboard/people', label: 'People', section: 'Management' },
					{ href: '/dashboard/staff', label: 'Staff', section: 'Management' },
					{
						href: '/dashboard/timesheets',
						label: 'Timesheets',
						feature: 'timekeeping',
						section: 'Management'
					},
					{ href: '/dashboard/intake', label: 'Intake', feature: 'intake', section: 'Management' },
					{
						href: '/dashboard/analytics',
						label: 'Analytics',
						feature: 'analytics',
						section: 'Management'
					},
					{
						href: '/dashboard/reports',
						label: 'Reports',
						feature: ['reports', 'reports_basic'],
						section: 'Management'
					},
					...(data.user.role === 'admin'
						? [
								{
									href: '/dashboard/audit',
									label: 'Audit log',
									feature: 'audit_log',
									section: 'Management'
								},
								{ href: '/dashboard/api-keys', label: 'API keys', section: 'Management' },
								{ href: '/dashboard/setup', label: 'Setup', section: 'Management' }
							]
						: []),
					{ href: '/me', label: 'Me' }
				]
		).filter((item: { feature?: string | string[] }) => {
			if (!item.feature) return true;
			const has = data.user.features as readonly string[];
			return [item.feature].flat().some((f) => has.includes(f));
		})
	);
	// Tab badges (frontend-spec-2.md §3.10): a red dot on Notes when one of
	// the caregiver's notes was sent back today, and on Shifts while a coverage
	// offer is waiting for them. Offers aren't synced, so they are polled.
	const returnedToday = $derived.by(() => {
		const today = localTime(new Date(), app.user.timeZone).day;
		return app.notes.some(
			(n) =>
				n.author_id === app.user.profileId &&
				n.status === 'returned' &&
				!!n.updated_at &&
				localTime(new Date(n.updated_at), app.user.timeZone).day === today
		);
	});
	let offersWaiting = $state(false);
	$effect(() => {
		if (data.user.role !== 'caregiver' || !nav.some((item) => item.href === '/shifts')) return;
		const check = () =>
			trpc.coverage.offers
				.query()
				.then((offers) => (offersWaiting = offers.length > 0))
				.catch(() => {});
		void check();
		const timer = setInterval(check, 60000);
		return () => clearInterval(timer);
	});
	const needsAttention = (href: string) =>
		data.user.role === 'caregiver' &&
		((href === '/notes' && returnedToday) || (href === '/shifts' && offersWaiting));

	/** The sidebar's sections, in order; items without one (Me) come last, unlabelled. */
	const navGroups = $derived.by(() => {
		const groups: { label: string; items: typeof nav }[] = [];
		for (const item of nav) {
			const label = (item as { section?: string }).section ?? '';
			const group = groups.find((g) => g.label === label);
			if (group) group.items.push(item);
			else groups.push({ label, items: [item] });
		}
		return groups.sort((a, b) => Number(!a.label) - Number(!b.label));
	});
	/** Counts beside supervisor links (frontend-spec-3.md §3), from the device. */
	const count = (href: string) =>
		data.user.role === 'caregiver'
			? 0
			: href === '/dashboard'
				? overviewAttention(app.incidents, app.health, app.homeId)
				: href === '/dashboard/notes'
					? app.notes.filter((n) => n.home_id === app.homeId && n.status === 'submitted').length
					: href === '/messages'
						? app.unseenMessageCount
						: href === '/shifts'
							? openShiftCount(app.shifts, app.homeId, new Date(), app.user.timeZone)
							: href === '/dashboard/mar'
								? app.doses.filter(
										(d) =>
											d.home_id === app.homeId &&
											(d.status === 'refused' || d.status === 'held') &&
											!d.acknowledged
									).length
								: 0;
	const countWords = (href: string, n: number) =>
		href === '/dashboard'
			? `${n} ${n === 1 ? 'needs' : 'need'} attention`
			: href === '/messages'
				? `${n} unread`
				: href === '/shifts'
					? `${n} open ${n === 1 ? 'shift' : 'shifts'}`
					: href === '/dashboard/mar'
						? `${n} refused or held to acknowledge`
						: `${n} to review`;
	// Red counts: things that need someone (frontend-spec-3.md §3 badge logic).
	const urgent = (href: string) =>
		href === '/dashboard' || href === '/shifts' || href === '/dashboard/mar';

	async function fetchKey() {
		const result = await trpc.device.key.mutate({ deviceId: await deviceId(app.user.profileId) });
		key = Uint8Array.from(atob(result.key.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
			c.charCodeAt(0)
		);
		step = 'set-pin';
	}
	// Device warnings (offline-sync.md §6-7): a long sync backlog, and storage
	// running large or nearly full. Storage is checked every 5 minutes.
	const backlog = $derived(backlogWarning(app.pending));
	let storage = $state<DeviceWarning | null>(null);
	onMount(() => {
		const check = () =>
			navigator.storage
				?.estimate?.()
				.then((e) => (storage = storageWarning(e.usage, e.quota)))
				.catch(() => {});
		check();
		const timer = setInterval(check, 5 * 60_000);
		return () => clearInterval(timer);
	});
	onMount(() => {
		let alive = true;
		void (async () => {
			try {
				const issue = deviceIssue(await inspectDevice());
				if (issue) {
					if (alive) {
						unsupported = true;
						message = issue;
					}
					return;
				}
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
			const database = await openDb(unlocked, app.user.profileId, {
				onWait: () => (waiting = true)
			});
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
						timeZone: agency.timezone,
						features: agency.features
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
			waiting = false;
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
			// Voice kept offline lives only on this device (LomiComposer transcribes it later).
			const kept = await app.db
				.get<{ n: number }>('SELECT count(*) AS n FROM pending_recordings')
				.catch(() => ({ n: 0 }));
			if (
				kept.n &&
				!confirm(
					'A recording you made offline hasn’t been transcribed yet. Signing out deletes it from this device. Sign out anyway?'
				)
			)
				return;
			await app.db.disconnectAndClear();
		}
		await stopWebPush(app.user.profileId);
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
			{#if waiting}<p role="status" class="callout">
					Guad is open in another tab. Lock or close it there and this tab opens by itself.
				</p>{/if}
			{#if message}<p role="alert" class="callout bad">{message}</p>
				<button class="textbtn" onclick={() => location.reload()}>Try again</button>{/if}
			<button class="textbtn" onclick={signOut}>Sign out</button>
			{#if unsupported}<InstallCard showWorkspace={false} />{/if}
		</div>
	</main>
{:else}
	<PrivacyShield
		profileId={app.user.profileId}
		onPrivacyChange={(masked) => {
			app.privacyLocked = masked;
		}}
		onReady={(lock) => {
			app.lock = lock;
		}}
		onLock={async () => {
			app.dispose();
			await closeDb();
		}}
		onUnlock={async (key, onWait) => {
			app.connect(await openDb(key, app.user.profileId, { onWait }));
		}}
	>
		<a class="skip-link" href="#main">Skip to content</a>
		<div class="app-shell">
			<aside class="sidebar">
				<a class="wordmark" href={resolve('/')}>Guad<span class="lemon-dot">●</span></a>
				<p class="eyebrow">Your workspace</p>
				<nav aria-label="Main navigation">
					{#each navGroups as group (group.label)}<div
							class="nav-group"
							role={group.label ? 'group' : undefined}
							aria-label={group.label || undefined}
						>
							{#if group.label}<p class="nav-section" aria-hidden="true">{group.label}</p>{/if}
							{#each group.items as item (item.href)}{@const n = count(
									item.href
								)}{@const countId = `nav-count-${item.href.replace(/\W+/g, '-')}`}<a
									href={resolve(('/(app)' + item.href) as '/(app)/today')}
									aria-current={page.url.pathname === item.href ? 'page' : undefined}
									aria-label={needsAttention(item.href)
										? `${item.label}, needs attention`
										: undefined}
									aria-describedby={n ? countId : undefined}
									>{item.label}{#if needsAttention(item.href)}<span class="dot" aria-hidden="true"
										></span>{/if}{#if n}<span
											class="count"
											class:bad={urgent(item.href)}
											aria-hidden="true">{n}</span
										>{/if}</a
								>{#if n}<span class="sr" id={countId}>{countWords(item.href, n)}</span>{/if}{/each}
						</div>{/each}
				</nav>
				<div class="sidebar-bottom">
					<b>{data.user.name}</b><span class="muted">{data.user.role}</span><button
						class="textbtn"
						onclick={() => app.lock()}>Lock device</button
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
							>{#each app.openHomes as home (home.id)}<option value={home.id}>{home.name}</option
								>{/each}{#if app.openHomes.length < app.homes.length}<optgroup label="Archived"
									>{#each app.homes.filter((h) => h.archived_at) as home (home.id)}<option
											value={home.id}>{home.name}</option
										>{/each}</optgroup
								>{/if}</select
						></label
					>
					<span class="sync-label" role="status" data-testid="sync-status"
						>{app.pending ? `${app.pending} changes waiting to sync` : app.status}</span
					>
					<ThemeToggle />
					<CommandPalette pages={nav} />
					<a
						class="textbtn"
						href={resolve('/(app)/messages')}
						aria-label={`Team messages, ${app.unseenMessageCount} new`}
						>Team messages{app.unseenMessageCount ? ` (${app.unseenMessageCount})` : ''}</a
					>
					<a
						class="textbtn"
						href={resolve('/(app)/notifications')}
						aria-label={`Alerts, ${app.unreadAlerts} unread`}
						>Alerts{app.unreadAlerts ? ` (${app.unreadAlerts})` : ''}</a
					>
				</header>
				<main id="main" class="main-content" tabindex="-1">
					<PushNotice />
					<UpgradeDialog isAdmin={data.user.role === 'admin'} />
					<EveningSuggestion />
					{#if app.error}<p class="callout bad" role="alert">{app.error}</p>{/if}
					{#each [backlog, storage].filter((w) => w !== null) as w (w.text)}<p
							class="callout {w.level}"
							role={w.level === 'bad' ? 'alert' : 'status'}
							data-testid="device-warning"
						>
							{w.text}
						</p>{/each}
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
				{#each data.user.role === 'caregiver' ? nav : ['/dashboard', '/dashboard/notes', '/shifts', '/me'].flatMap( (href) => nav.filter((item) => item.href === href) ) as item (item.href)}<a
						href={resolve(('/(app)' + item.href) as '/(app)/today')}
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
						aria-label={needsAttention(item.href) ? `${item.label}, needs attention` : undefined}
						>{item.label}{#if needsAttention(item.href)}<span class="dot" aria-hidden="true"
							></span>{/if}</a
					>{/each}
			</nav>
		</div>
	</PrivacyShield>
{/if}
