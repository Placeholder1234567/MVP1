<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		offlineProfiles,
		unwrapOfflineKey,
		offlineAccessUntil,
		PasskeyError,
		WrongPinError
	} from '#lib/sync/device-key.ts';
	import type { PowerSyncDatabase } from '@powersync/web';
	import type { Database } from '#lib/sync/schema.ts';
	import type { AppUser } from '#lib/app/session.svelte.ts';
	import { offlinePermissions } from '#lib/domain/pwa.ts';
	import { FEATURE_FLAGS } from '#lib/entitlements/tier-features.ts';
	import { inspectDevice, deviceIssue } from '#lib/pwa/readiness.ts';
	import InstallCard from '#lib/app/InstallCard.svelte';
	let profiles = $state<string[]>([]);
	let profileId = $state('');
	let pin = $state('');
	let error = $state('');
	let busy = $state(false);
	let waiting = $state(false);
	let checked = $state(false);
	let unsupported = $state(false);
	let user = $state<AppUser | null>(null);
	let database = $state.raw<PowerSyncDatabase | undefined>();
	let expiresAt = $state(0);
	// The encrypted database and the workspace are loaded on demand, not with
	// the page: the PIN screen must be interactive fast on slow connections
	// (constitution "Performance Targets"). Focusing the PIN field starts the
	// download, so unlocking doesn't wait for it.
	const dbModule = () => import('#lib/sync/db.ts');
	let dbLoaded = false;
	let Workspace = $state.raw<typeof import('#lib/app/OfflineWorkspace.svelte').default>();
	function prefetch() {
		void dbModule();
		void import('#lib/app/OfflineWorkspace.svelte');
	}
	async function closeDb() {
		if (dbLoaded) await (await dbModule()).closeDb();
	}
	onMount(() => {
		void inspectDevice()
			.then(async (state) => {
				const issue = deviceIssue(state);
				if (issue) {
					unsupported = true;
					throw new Error('Device unavailable');
				}
				return offlineProfiles();
			})
			.then((ids) => {
				profiles = ids;
				profileId = ids[0] ?? '';
			})
			.catch(() => {
				error = 'This browser cannot open saved records. Reconnect and sign in.';
			})
			.finally(() => (checked = true));
		const timer = setInterval(() => {
			if (user && Date.now() >= expiresAt) {
				void lock();
				error = 'Saved access expired. Reconnect and sign in.';
			}
		}, 10000);
		return () => {
			clearInterval(timer);
			void closeDb();
		};
	});
	async function unlock(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		let key: Uint8Array | undefined;
		try {
			key = await unwrapOfflineKey(pin, profileId);
			expiresAt = await offlineAccessUntil(profileId);
			const [{ openDb }, workspace] = await Promise.all([
				dbModule(),
				import('#lib/app/OfflineWorkspace.svelte')
			]);
			dbLoaded = true;
			Workspace = workspace.default;
			database = await openDb(key, profileId, { offline: true, onWait: () => (waiting = true) });
			const person = await database.getOptional<Database['profiles']>(
				'SELECT * FROM profiles WHERE id = ?',
				[profileId]
			);
			if (
				!person?.active ||
				!person.agency_id ||
				!person.name ||
				!['caregiver', 'supervisor', 'admin'].includes(person.role ?? '')
			)
				throw new Error('Saved profile unavailable');
			const snapshot = await database.getOptional<{ user_json: string }>(
				'SELECT user_json FROM offline_sessions WHERE id = ?',
				[profileId]
			);
			const cached: AppUser | null = snapshot ? JSON.parse(snapshot.user_json) : null;
			if (
				!cached ||
				cached.profileId !== profileId ||
				cached.agencyId !== person.agency_id ||
				typeof cached.timeZone !== 'string' ||
				!['caregiver', 'supervisor', 'admin'].includes(cached.role) ||
				!Array.isArray(cached.homeIds) ||
				!cached.homeIds.every((id) => typeof id === 'string') ||
				typeof cached.medCertified !== 'boolean'
			)
				throw new Error('Saved profile unavailable');
			new Intl.DateTimeFormat('en', { timeZone: cached.timeZone });
			const homes: unknown = JSON.parse(person.home_ids ?? '[]');
			if (!Array.isArray(homes) || !homes.every((id) => typeof id === 'string'))
				throw new Error('Saved profile unavailable');
			const syncedRole = person.role as AppUser['role'];
			user = {
				profileId,
				agencyId: person.agency_id,
				name: person.name,
				...offlinePermissions(cached, {
					role: syncedRole,
					homeIds: homes,
					medCertified: !!person.med_certified
				}),
				timeZone: cached.timeZone,
				// Saved with the session; an older saved session shows every screen
				// (data outside the plan isn't on the device anyway).
				features:
					Array.isArray(cached.features) && cached.features.every((f) => typeof f === 'string')
						? cached.features
						: FEATURE_FLAGS
			};
		} catch (e) {
			await closeDb();
			database = undefined;
			error =
				e instanceof WrongPinError || e instanceof PasskeyError
					? e.message
					: 'Saved access is unavailable or expired. Reconnect and sign in to refresh this device.';
		} finally {
			key?.fill(0);
			pin = '';
			busy = false;
			waiting = false;
		}
	}
	async function lock() {
		user = null;
		await closeDb();
		database = undefined;
	}
</script>

<svelte:head><title>Saved workspace · Guad</title></svelte:head>
<svelte:window
	onpagehide={() => {
		void lock();
	}}
	onpageshow={(event) => {
		if (event.persisted) void lock();
	}}
/>
{#if user && database && Workspace}<Workspace {user} db={database} {expiresAt} />{:else}
	<main class="unlock-page">
		<div class="card pad stack">
			<span class="wordmark">Guad<span class="lemon-dot">●</span></span>
			<p class="eyebrow">Saved workspace</p>
			<h1>Your shift can continue.</h1>
			<p class="muted">
				Unlock records already saved on this device. Saved access lasts up to 12 hours after your
				last verified sign-in.
			</p>
			{#if profiles.length}<form class="stack" onsubmit={unlock}>
					{#if profiles.length > 1}<label
							>Saved profile<select class="input" bind:value={profileId}
								>{#each profiles as id, index (id)}<option value={id}
										>Saved profile {index + 1} · {id.slice(0, 6)}</option
									>{/each}</select
							></label
						>{/if}<label
						>Device PIN<input
							class="input"
							type="password"
							inputmode="numeric"
							pattern={'[0-9]{6,8}'}
							required
							autocomplete="off"
							onfocus={prefetch}
							bind:value={pin}
						/></label
					><button class="btn" disabled={busy}>{busy ? 'Opening…' : 'Unlock saved records'}</button>
				</form>{:else if checked}<p class="callout">
					Connect and sign in to prepare or refresh this device for offline use.
				</p>{/if}
			{#if waiting}<p class="callout" role="status">
					Guad is open in another tab. Lock or close it there and this tab opens by itself.
				</p>{/if}
			{#if error}<p class="callout bad" role="alert">{error}</p>{/if}<a
				class="btn sec"
				href={resolve('/')}
				data-sveltekit-reload>Return to sign-in</a
			>
			{#if unsupported}<InstallCard showWorkspace={false} />{/if}
		</div>
	</main>
{/if}
