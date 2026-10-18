<script lang="ts">
	// Audit log (security.md "Audit Trail > Access"; trpc-router.md audit.*).
	// Admins on the Complete plan. The list is metadata only; opening an entry
	// shows its values and is itself recorded in the audit log.
	import { onMount } from 'svelte';
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

	async function load(reset = true) {
		if (reset) offset = 0;
		loading = true;
		message = '';
		try {
			entries = await trpc.audit.list.query({
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
			});
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connect to load the audit log.';
		} finally {
			loading = false;
		}
	}
	onMount(() => void load());

	let exporting = $state(false);
	/** The filtered list's metadata as CSV (never record values); the download is recorded. */
	async function download() {
		message = '';
		if (!from || !to) {
			message = 'Choose a From and To date to download.';
			return;
		}
		exporting = true;
		try {
			const file = await trpc.audit.export.mutate({
				tableName: tableName || undefined,
				action: action || undefined,
				dateRange: {
					from: new Date(`${from}T00:00:00`).toISOString(),
					to: new Date(`${to}T23:59:59`).toISOString()
				}
			});
			const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			URL.revokeObjectURL(url);
			message = `Downloaded ${file.rows} ${file.rows === 1 ? 'entry' : 'entries'}.`;
		} catch (e) {
			message = e instanceof Error ? e.message : 'Connect to download the audit log.';
		} finally {
			exporting = false;
		}
	}

	async function open(id: string) {
		try {
			detail = await trpc.audit.get.query({ id });
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not open that entry.';
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
			<button class="btn" disabled={loading}>Show entries</button>
			<button type="button" class="btn sec" disabled={exporting} onclick={download}
				>Download CSV</button
			>
		</div>
		<p class="muted s13">
			Downloads list who did what and when, for up to 93 days, without record values. Each download
			is recorded.
		</p>
	</form>
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if detail}
		<article class="card pad stack" aria-label="Audit entry">
			<div class="spread">
				<h2>{detail.action} · {detail.tableName}</h2>
				<button class="btn sec" onclick={() => (detail = null)}>Close</button>
			</div>
			<p class="muted">
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
		</article>
	{/if}

	{#if loading && !entries.length}<Skeleton count={5} label="Loading audit entries" />{:else}
		<div class="list card" role="group" aria-label="Audit entries">
			{#each entries as e (e.id)}
				<button class="row" onclick={() => open(e.id)}>
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
			disabled={loading || offset === 0}
			onclick={() => {
				offset = Math.max(0, offset - PAGE);
				void load(false);
			}}>Newer</button
		>
		<button
			class="btn sec"
			disabled={loading || entries.length < PAGE}
			onclick={() => {
				offset += PAGE;
				void load(false);
			}}>Older</button
		>
	</div>
</section>
