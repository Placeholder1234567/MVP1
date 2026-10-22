<script lang="ts">
	// API keys for the external API (openapi.yaml): admins create a key for an
	// integration (EVV aggregator, data warehouse), see it once, and revoke it
	// when it's no longer needed. Keys are never deleted, so access stays auditable.
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { ReportJobGuard, reportCanConnect } from '#lib/app/report-job.ts';
	import { trpc } from '#lib/trpc.ts';
	import Skeleton from '#lib/app/Skeleton.svelte';

	type Key = Awaited<ReturnType<typeof trpc.apiKey.list.query>>[number];
	type Created = Awaited<ReturnType<typeof trpc.apiKey.create.mutate>>;
	type Hook = Awaited<ReturnType<typeof trpc.apiKey.webhooks.query>>[number];

	let keys = $state<Key[]>([]);
	let hooks = $state<Hook[]>([]);
	let loading = $state(false);
	let saving = $state(false);
	let message = $state('');
	let adding = $state(false);
	let name = $state('');
	let scope = $state<'read' | 'write'>('read');
	let created = $state<Created | null>(null);
	let copied = $state(false);

	const app = useSession();
	let online = $state(false);
	let visible = $state(false);
	const canConnect = $derived(
		app.user.role === 'admin' && reportCanConnect(online, visible, app.privacyLocked)
	);
	const guard = new ReportJobGuard();
	const controllers: Partial<Record<'list' | 'change', AbortController>> = {};
	const context = () =>
		JSON.stringify([
			app.user.agencyId,
			app.user.profileId,
			app.user.role,
			app.user.features,
			app.privacyLocked
		]);
	function abortAll() {
		for (const controller of Object.values(controllers)) controller?.abort();
		created = null;
		copied = false;
		loading = false;
		saving = false;
	}
	function forget() {
		abortAll();
		keys = [];
		hooks = [];
		adding = false;
		name = '';
		scope = 'read';
		message = '';
	}
	$effect(() => {
		if (guard.change(context())) forget();
	});
	beforeNavigate(() => {
		guard.change('navigating');
		forget();
	});
	onDestroy(() => {
		guard.change('disposed');
		abortAll();
	});
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
			visible = document.visibilityState === 'visible';
			if (!online || !visible) {
				guard.change(`unavailable-${Date.now()}`);
				abortAll();
			}
		};
		update();
		void load();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		document.addEventListener('visibilitychange', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
			document.removeEventListener('visibilitychange', update);
		};
	});
	function begin(kind: 'list' | 'change') {
		guard.change(context());
		const current = guard.capture();
		const original = context();
		controllers[kind]?.abort();
		const abort = new AbortController();
		controllers[kind] = abort;
		return {
			signal: abort.signal,
			valid: () =>
				current() &&
				original === context() &&
				canConnect &&
				!abort.signal.aborted &&
				controllers[kind] === abort
		};
	}
	const when = (d: Date | string | null) =>
		d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

	async function load() {
		if (!canConnect) return;
		const operation = begin('list');
		loading = true;
		try {
			const result = await Promise.all([
				trpc.apiKey.list.query(undefined, { signal: operation.signal }),
				trpc.apiKey.webhooks.query(undefined, { signal: operation.signal })
			]);
			if (operation.valid()) [keys, hooks] = result;
		} catch (e) {
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Connect to manage API keys.';
		} finally {
			if (operation.valid()) loading = false;
		}
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (!canConnect || saving) return;
		const operation = begin('change');
		saving = true;
		message = '';
		created = null;
		try {
			const result = await trpc.apiKey.create.mutate({ name, scope }, { signal: operation.signal });
			if (!operation.valid()) return;
			created = result;
			copied = false;
			adding = false;
			name = '';
			scope = 'read';
			await load();
		} catch (e) {
			if (operation.valid()) message = e instanceof Error ? e.message : 'Connect to create a key.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}

	async function revoke(key: Key) {
		if (
			!canConnect ||
			saving ||
			!confirm(`Revoke "${key.name}"? Integrations using it will stop working at once.`)
		)
			return;
		const operation = begin('change');
		saving = true;
		message = '';
		try {
			await trpc.apiKey.revoke.mutate({ id: key.id }, { signal: operation.signal });
			if (!operation.valid()) return;
			if (created?.id === key.id) created = null;
			await load();
		} catch (e) {
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Connect to revoke the key.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}

	async function removeHook(hook: Hook) {
		if (
			!canConnect ||
			saving ||
			!confirm(`Delete the webhook to ${hook.url}? It stops receiving events at once.`)
		)
			return;
		const operation = begin('change');
		saving = true;
		message = '';
		try {
			await trpc.apiKey.deleteWebhook.mutate({ id: hook.id }, { signal: operation.signal });
			if (operation.valid()) await load();
		} catch (e) {
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Connect to delete the webhook.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}

	async function copy() {
		if (!canConnect || !created) return;
		const current = guard.capture();
		const original = created;
		try {
			await navigator.clipboard.writeText(original.key);
			if (current() && created === original && canConnect) copied = true;
		} catch {
			if (current() && created === original && canConnect)
				message = 'Copy failed. Select the key and copy it yourself.';
		}
	}
</script>

<svelte:head><title>API keys · Guad</title></svelte:head>

<section class="stack" aria-label="API keys">
	<div class="spread">
		<div>
			<h1>API keys</h1>
			<p class="muted">
				For external systems such as EVV aggregators and data warehouses. Each key can read your
				agency's records, so share it only with vendors you have a BAA with.
			</p>
		</div>
		{#if !adding}<button
				class="btn"
				disabled={saving || !canConnect}
				onclick={() => (adding = true)}>New key</button
			>{/if}
	</div>

	<p class="muted">
		If a change is interrupted by locking, navigation or a lost connection, it may still complete.
		Refresh the list and revoke any unused key before creating a replacement. A hidden key cannot be
		shown again.
	</p>
	<div class="actions">
		<button type="button" class="btn sec" disabled={loading || saving || !canConnect} onclick={load}
			>Refresh keys</button
		>
	</div>
	{#if !canConnect}<p class="muted" role="status">
			Connect with this workspace visible and unlocked to manage API keys.
		</p>{/if}
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if created}
		<div class="callout warn stack" role="status" aria-live="polite">
			<b>Copy this key now. It won't be shown again.</b>
			<code class="secret">{created.key}</code>
			<div class="actions">
				<button type="button" class="btn sec" disabled={!canConnect} onclick={copy}
					>{copied ? 'Copied' : 'Copy key'}</button
				>
				<button type="button" class="btn sec" onclick={() => (created = null)}>Done</button>
			</div>
		</div>
	{/if}

	{#if adding}
		<form class="card pad stack" onsubmit={create}>
			<label
				>Name<input
					class="input"
					required
					maxlength="80"
					placeholder="e.g. State EVV aggregator"
					bind:value={name}
				/></label
			>
			<fieldset class="stack">
				<legend>Access</legend>
				<label class="check"
					><input type="radio" name="scope" value="read" bind:group={scope} /> Read only (EVV and exports)</label
				>
				<label class="check"
					><input type="radio" name="scope" value="write" bind:group={scope} /> Read and write (also reports
					and webhooks)</label
				>
			</fieldset>
			<div class="actions">
				<button class="btn" disabled={saving || !canConnect}>Create key</button>
				<button type="button" class="btn sec" onclick={() => (adding = false)}>Cancel</button>
			</div>
		</form>
	{/if}

	{#if loading}<Skeleton count={2} label="Loading API keys" />{:else}
		<div class="list card" role="list">
			{#each keys as key (key.id)}
				<div class="row" role="listitem">
					<span class="grow">
						<b>{key.name}{key.revokedAt ? ' · revoked' : ''}</b>
						<span class="muted"
							><code>{key.prefix}…</code> · {key.scope === 'write' ? 'Read and write' : 'Read only'}
							· created {when(key.createdAt)}{key.lastUsedAt
								? ` · last used ${when(key.lastUsedAt)}`
								: ' · never used'}{key.revokedAt ? ` · revoked ${when(key.revokedAt)}` : ''}</span
						>
					</span>
					{#if !key.revokedAt}<button
							class="btn sec"
							disabled={saving || !canConnect}
							aria-label="Revoke {key.name}"
							onclick={() => revoke(key)}>Revoke</button
						>{/if}
				</div>
			{:else}
				<div class="row muted" role="listitem">No API keys yet.</div>
			{/each}
		</div>
		<h2>Webhooks</h2>
		<p class="muted">
			Registered by integrations through the API. Revoking a key stops the webhooks it registered.
		</p>
		<div class="list card" role="list" aria-label="Webhooks">
			{#each hooks as hook (hook.id)}
				<div class="row" role="listitem">
					<span class="grow">
						<b class="url">{hook.url}{hook.active ? '' : ' · stopped'}</b>
						<span class="muted">{hook.events.join(', ')} · created {when(hook.created_at)}</span>
					</span>
					<button
						class="btn sec"
						disabled={saving || !canConnect}
						aria-label="Delete webhook to {hook.url}"
						onclick={() => removeHook(hook)}>Delete</button
					>
				</div>
			{:else}
				<div class="row muted" role="listitem">No webhooks.</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.url {
		overflow-wrap: anywhere;
	}

	.secret {
		display: block;
		padding: 10px 12px;
		background: var(--card);
		border: 1px solid var(--line2);
		border-radius: 10px;
		overflow-wrap: anywhere;
		user-select: all;
	}
</style>
