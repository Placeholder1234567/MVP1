<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { signOutEverywhere } from '#lib/auth/firebase.ts';
	import { closeDb, openDb } from '#lib/sync/db.ts';
	import {
		deviceId,
		hasWrappedKey,
		unwrapKey,
		wrapKey,
		WrongPinError
	} from '#lib/sync/device-key.ts';
	import { trpc } from '#lib/trpc.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// checking -> set-pin (first time on this device) | enter-pin -> open
	let step = $state<'checking' | 'set-pin' | 'enter-pin' | 'open'>('checking');
	let pin = $state('');
	let pinAgain = $state('');
	let message = $state('');
	let busy = $state(false);
	let homes = $state<{ id: string; name: string }[]>([]);
	let people = $state<{ id: string; name: string }[]>([]);
	let syncStatus = $state('Connecting…');
	let board = $state<{ id: string; from_name: string; body: string; sent_at: string }[]>([]);
	let failed = $state<{ id: string; code: string; message: string }[]>([]);
	let pending = $state(0);
	let draft = $state('');
	let postTo = $state('');
	// Caregivers post to their own homes; supervisors to any home in the agency.
	const myHomes = $derived(
		data.user.role === 'caregiver' ? homes.filter((h) => data.user.homeIds.includes(h.id)) : homes
	);
	let db: Awaited<ReturnType<typeof openDb>> | undefined;
	// Held only until a PIN is set; never stored unwrapped.
	let newKey: Uint8Array | undefined;

	async function fetchKeyOnline() {
		const { key } = await trpc.device.key.mutate({ deviceId: await deviceId() });
		const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
		newKey = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		step = 'set-pin';
	}

	onMount(() => {
		(async () => {
			try {
				if (await hasWrappedKey()) step = 'enter-pin';
				else await fetchKeyOnline();
			} catch (e) {
				message = e instanceof Error ? e.message : 'Could not set up this device';
			}
		})();
		return () => void closeDb();
	});

	async function open(key: Uint8Array) {
		db = await openDb(key);
		const local = db;
		step = 'open';
		db.watch('SELECT id, name FROM homes ORDER BY name', [], {
			onResult: (r) => (homes = (r.rows?._array ?? []) as typeof homes)
		});
		// Home-scoped: caregivers only have their own homes' people on the device.
		db.watch('SELECT id, name FROM clients WHERE active = 1 ORDER BY name', [], {
			onResult: (r) => (people = (r.rows?._array ?? []) as typeof people)
		});
		local.watch(
			'SELECT id, from_name, body, sent_at FROM messages ORDER BY sent_at DESC LIMIT 20',
			[],
			{ onResult: (r) => (board = (r.rows?._array ?? []) as typeof board) }
		);
		local.watch('SELECT id, code, message FROM failed_writes ORDER BY failed_at DESC', [], {
			onResult: (r) => (failed = (r.rows?._array ?? []) as typeof failed)
		});
		const show = () => {
			const s = local.currentStatus;
			void local.getUploadQueueStats().then((q) => (pending = q.count));
			syncStatus = s.connected
				? s.lastSyncedAt
					? `Synced ${s.lastSyncedAt.toLocaleTimeString()}`
					: 'Syncing…'
				: s.hasSynced
					? 'Offline: showing what is saved on this device'
					: 'Offline';
		};
		show();
		local.registerListener({ statusChanged: show });
		local.onChange({
			onChange: () => void local.getUploadQueueStats().then((q) => (pending = q.count))
		});
	}

	/** Writes to the local database only; works offline. The queue uploads it via sync.upload. */
	async function post(event: SubmitEvent) {
		event.preventDefault();
		const home = postTo || myHomes[0]?.id;
		if (!db || !home || !draft.trim()) return;
		const now = new Date().toISOString();
		await db.execute(
			'INSERT INTO messages (id, home_id, from_name, body, sent_at, created_at, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?)',
			[home, data.user.name, draft.trim(), now, now, now]
		);
		draft = '';
	}

	async function setPin(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		if (!/^\d{6,8}$/.test(pin)) return void (message = 'Use 6 to 8 digits.');
		if (pin !== pinAgain) return void (message = "The PINs don't match.");
		busy = true;
		try {
			await wrapKey(newKey!, pin);
			const key = newKey!;
			newKey = undefined;
			await open(key);
		} finally {
			pin = pinAgain = '';
			busy = false;
		}
	}

	async function unlock(event: SubmitEvent) {
		event.preventDefault();
		message = '';
		busy = true;
		try {
			await open(await unwrapKey(pin));
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not unlock';
			// Out of attempts: the wrapped key is gone; online sign-in gets it again.
			if (e instanceof WrongPinError && e.attemptsLeft === 0) {
				await fetchKeyOnline().catch(() => {});
			}
		} finally {
			pin = '';
			busy = false;
		}
	}

	async function signOut() {
		await closeDb();
		await signOutEverywhere();
		await goto(resolve('/login'), { refreshAll: true });
	}
</script>

<svelte:head>
	<title>Guad</title>
</svelte:head>

<main>
	<h1>Guad</h1>
	<p>Signed in as {data.user.name} ({data.user.role}). Phase 1 build, synthetic data only.</p>

	{#if step === 'set-pin'}
		<h2>Set a PIN for this device</h2>
		<p>You'll use it to open Guad here, even offline.</p>
		<form onsubmit={setPin}>
			<label>
				PIN
				<input type="password" inputmode="numeric" autocomplete="new-password" bind:value={pin} />
			</label>
			<label>
				Again
				<input
					type="password"
					inputmode="numeric"
					autocomplete="new-password"
					bind:value={pinAgain}
				/>
			</label>
			<button disabled={busy}>Save PIN</button>
		</form>
	{:else if step === 'enter-pin'}
		<h2>Enter your PIN</h2>
		<form onsubmit={unlock}>
			<label>
				PIN
				<input
					type="password"
					inputmode="numeric"
					autocomplete="current-password"
					bind:value={pin}
				/>
			</label>
			<button disabled={busy}>Unlock</button>
		</form>
	{:else if step === 'open'}
		<p data-testid="sync-status">{syncStatus}</p>
		<h2>Your homes</h2>
		<ul>
			{#each homes as home (home.id)}
				<li>{home.name}</li>
			{/each}
		</ul>
		{#if pending}<p data-testid="pending">
				{pending} change{pending === 1 ? '' : 's'} waiting to sync
			</p>{/if}
		{#if failed.length}
			<div role="alert" data-testid="failed">
				<p>{failed.length} change{failed.length === 1 ? '' : 's'} could not be saved:</p>
				<ul>
					{#each failed as f (f.id)}<li>{f.message}</li>{/each}
				</ul>
			</div>
		{/if}
		<h2>People</h2>
		<ul data-testid="people">
			{#each people as person (person.id)}
				<li>{person.name}</li>
			{/each}
		</ul>
		<h2>Team messages</h2>
		<form onsubmit={post}>
			<select bind:value={postTo} aria-label="Home">
				{#each myHomes as h (h.id)}<option value={h.id}>{h.name}</option>{/each}
			</select>
			<input
				bind:value={draft}
				placeholder="Message your team"
				aria-label="Message"
				maxlength="2000"
			/>
			<button>Send</button>
		</form>
		<ul data-testid="board">
			{#each board as m (m.id)}
				<li><strong>{m.from_name}:</strong> {m.body}</li>
			{/each}
		</ul>
	{:else}
		<p>Opening…</p>
	{/if}
	{#if message}<p role="alert">{message}</p>{/if}

	<button onclick={signOut}>Sign out</button>
</main>
