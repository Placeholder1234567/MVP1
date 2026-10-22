<script lang="ts">
	// Audit log (security.md "Audit Trail > Access"; trpc-router.md audit.*).
	// Admins on the Complete plan. The list is metadata only; opening an entry
	// shows its values and is itself recorded in the audit log.
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { ReportJobGuard, reportCanConnect } from '#lib/app/report-job.ts';
	import { trpc } from '#lib/trpc.ts';
	import Skeleton from '#lib/app/Skeleton.svelte';

	type Entry = Awaited<ReturnType<typeof trpc.audit.list.query>>[number];
	type Detail = Awaited<ReturnType<typeof trpc.audit.get.query>>;
	const PAGE = 50;
	const TABLES = [
		'notes',
		'note_goals',
		'mar_records',
		'medications',
		'health_entries',
		'incidents',
		'attendance',
		'clients',
		'client_health_info',
		'goals',
		'profiles',
		'clock_records',
		'schedule_slots',
		'referrals',
		'report_exports',
		'ai_invocations',
		'api_access',
		'api_keys',
		'mfa_resets',
		'message_photos',
		'photo_views',
		'audit_views'
	];

	let entries = $state<Entry[]>([]);
	let detail = $state<Detail | null>(null);
	let loading = $state(false);
	let message = $state('');
	let tableName = $state('');
	let action = $state<'' | 'INSERT' | 'UPDATE' | 'DELETE'>('');
	let from = $state('');
	let to = $state('');
	let offset = $state(0);

	const app = useSession();
	let online = $state(false);
	let visible = $state(false);
	let opening = $state(false);
	let exporting = $state(false);
	const guard = new ReportJobGuard();
	type Operation = 'list' | 'detail' | 'export';
	const controllers: Partial<Record<Operation, AbortController>> = {};
	const context = () =>
		JSON.stringify([
			app.user.agencyId,
			app.user.profileId,
			app.user.role,
			app.user.features,
			app.privacyLocked
		]);
	const canConnect = $derived(reportCanConnect(online, visible, app.privacyLocked));
	function abortAll() {
		for (const abort of Object.values(controllers)) abort?.abort();
		loading = false;
		opening = false;
		exporting = false;
	}
	function forget() {
		abortAll();
		entries = [];
		detail = null;
		offset = 0;
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
	function begin(kind: Operation) {
		guard.change(context());
		const stillCurrent = guard.capture();
		const original = context();
		controllers[kind]?.abort();
		const abort = new AbortController();
		controllers[kind] = abort;
		return {
			signal: abort.signal,
			valid: () =>
				stillCurrent() &&
				original === context() &&
				canConnect &&
				!abort.signal.aborted &&
				controllers[kind] === abort
		};
	}
	function closeDetail() {
		controllers.detail?.abort();
		detail = null;
		opening = false;
	}

	async function load(reset = true) {
		if (!canConnect) return;
		const operation = begin('list');
		closeDetail();
		if (reset) offset = 0;
		loading = true;
		message = '';
		try {
			const result = await trpc.audit.list.query(
				{
					tableName: tableName || undefined,
					action: action || undefined,
					dateRange:
						from && to
							? {
									from: new Date(`${from}T00:00:00`).toISOString(),
									to: new Date(`${to}T23:59:59`).toISOString()
								}
							: undefined,
					limit: PAGE,
					offset
				},
				{ signal: operation.signal }
			);
			if (operation.valid()) entries = result;
		} catch (e) {
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Connect to load the audit log.';
		} finally {
			if (operation.valid()) loading = false;
		}
	}
	/** The filtered list's metadata as CSV (never record values); the download is recorded. */
	async function download() {
		if (!canConnect || exporting) return;
		message = '';
		if (!from || !to) {
			message = 'Choose a From and To date to download.';
			return;
		}
		const operation = begin('export');
		exporting = true;
		try {
			const file = await trpc.audit.export.mutate(
				{
					tableName: tableName || undefined,
					action: action || undefined,
					dateRange: {
						from: new Date(`${from}T00:00:00`).toISOString(),
						to: new Date(`${to}T23:59:59`).toISOString()
					}
				},
				{ signal: operation.signal }
			);
			if (!operation.valid()) return;
			const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message = `Downloaded ${file.rows} ${file.rows === 1 ? 'entry' : 'entries'}.`;
		} catch (e) {
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Connect to download the audit log.';
		} finally {
			if (operation.valid()) exporting = false;
		}
	}

	async function open(id: string) {
		if (!canConnect) return;
		const operation = begin('detail');
		detail = null;
		opening = true;
		try {
			const result = await trpc.audit.get.query({ id }, { signal: operation.signal });
			if (operation.valid()) detail = result;
		} catch (e) {
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Could not open that entry.';
		} finally {
			if (operation.valid()) opening = false;
		}
	}

	/** For an update, only the fields that changed; otherwise every field. */
	function changes(d: Detail) {
		const before = (d.oldValues ?? {}) as Record<string, unknown>;
		const after = (d.newValues ?? {}) as Record<string, unknown>;
		const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
			(k) => k !== 'updated_at'
		);
		return keys
			.filter(
				(k) => d.action !== 'UPDATE' || JSON.stringify(before[k]) !== JSON.stringify(after[k])
			)
			.map((k) => ({ field: k, before: before[k], after: after[k] }));
	}
	const show = (v: unknown) =>
		v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v);
	const when = (d: Date | string) => new Date(d).toLocaleString();
</script>

<svelte:head><title>Audit log · Guad</title></svelte:head>

<section class="stack" aria-label="Audit log">
	<h1>Audit log</h1>
	<p class="muted">
		Every change to care records, people and staff, and actions such as exports and AI use. Entries
		can't be edited or deleted. Opening an entry shows its values and is recorded too.
	</p>
	<form
		class="card pad stack"
		onsubmit={(e) => {
			e.preventDefault();
			void load();
		}}
	>
		<div class="grid2">
			<label
				>Record type<select class="input" bind:value={tableName}
					><option value="">All</option>{#each TABLES as t (t)}<option value={t}>{t}</option
						>{/each}</select
				></label
			>
			<label
				>Action<select class="input" bind:value={action}
					><option value="">All</option><option value="INSERT">Created</option><option
						value="UPDATE">Changed</option
					><option value="DELETE">Deleted</option></select
				></label
			>
			<label>From<input class="input" type="date" bind:value={from} /></label>
			<label>To<input class="input" type="date" bind:value={to} /></label>
		</div>
		<div class="actions">
			<button class="btn" disabled={loading || !canConnect}>Show entries</button>
			<button type="button" class="btn sec" disabled={exporting || !canConnect} onclick={download}
				>Download CSV</button
			>
		</div>
		<p class="muted s13">
			Downloads list who did what and when, for up to 93 days, without record values. Each download
			is recorded.
		</p>
	</form>
	{#if !online}<p role="status">
			Reconnect to refresh, open or download audit entries. Your filters stay here.
		</p>{/if}
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if detail || opening}
		<article class="card pad stack" aria-label="Audit entry">
			<div class="spread">
				<h2>
					{#if detail}{detail.action} · {detail.tableName}{:else}Audit entry{/if}
				</h2>
				<button class="btn sec" onclick={closeDetail}>Close</button>
			</div>
			{#if opening}<p role="status">Loading entry…</p>{/if}
			{#if detail}<p class="muted">
					{when(detail.createdAt)} · {detail.performedByName ?? 'System'} · record {detail.recordId}
					{#if detail.ipAddress}· {detail.ipAddress}{/if}
				</p>
				<div class="list card" role="list">
					{#each changes(detail) as c (c.field)}
						<div class="row" role="listitem">
							<span class="grow"
								><b>{c.field}</b><span
									>{#if detail.action === 'UPDATE'}{show(c.before)} →
									{/if}{show(detail.action === 'DELETE' ? c.before : c.after)}</span
								></span
							>
						</div>
					{:else}
						<div class="row muted" role="listitem">No field values recorded.</div>
					{/each}
				</div>
			{/if}
		</article>
	{/if}

	{#if loading && !entries.length}<Skeleton count={5} label="Loading audit entries" />{:else}
		<div class="list card" role="group" aria-label="Audit entries">
			{#each entries as e (e.id)}
				<button class="row" disabled={!canConnect} onclick={() => open(e.id)}>
					<span class="grow"
						><b>{e.action} · {e.tableName}</b><span
							>{when(e.createdAt)} · {e.performedByName ?? 'System'}</span
						></span
					>
				</button>
			{:else}
				<div class="row muted">No entries match.</div>
			{/each}
		</div>
	{/if}
	<div class="actions">
		<button
			class="btn sec"
			disabled={loading || !canConnect || offset === 0}
			onclick={() => {
				offset = Math.max(0, offset - PAGE);
				void load(false);
			}}>Newer</button
		>
		<button
			class="btn sec"
			disabled={loading || !canConnect || entries.length < PAGE}
			onclick={() => {
				offset += PAGE;
				void load(false);
			}}>Older</button
		>
	</div>
</section>
