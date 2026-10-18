<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { trpc } from '#lib/trpc.ts';
	import { useSession } from '#lib/app/session.svelte.ts';
	import {
		CSV_LIMITS,
		IMPORT_HEADERS,
		CsvImportError,
		parseImportCsv,
		previewImport,
		importKey,
		type ImportKind,
		type ImportContext,
		type ImportPreviewRow,
		type ImportPayload
	} from '#lib/domain/csv-import.ts';
	import { ImportBatch, type ImportOutcome } from '#lib/imports/import-batch.ts';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const app = useSession();
	const kinds = $derived(
		(['people', 'goals', 'medications'] as const).filter((kind) => data.importFeatures[kind])
	);
	let kind = $state<ImportKind>('people');
	let context = $state<ImportContext>({ homes: [], people: [] });
	let rows = $state<ImportPreviewRow[]>([]);
	let outcomes = $state<ImportOutcome[]>([]);
	let batch: ImportBatch | undefined;
	let busy = $state(false);
	let applying = $state(false);
	let online = $state(true);
	let message = $state('');
	let reviewed = $state(false);
	let attempted = $state(false);
	const errors = $derived(rows.filter((row) => row.errors.length).length);
	const dirty = $derived(rows.length > 0);
	const statusLabels: Record<ImportOutcome['status'], string> = {
		pending: 'Not imported',
		creating: 'Creating…',
		created: 'Created',
		unconfirmed: 'Unconfirmed — check records before another import',
		'not-attempted': 'Not attempted'
	};
	onMount(() => {
		const connection = () => (online = navigator.onLine);
		connection();
		window.addEventListener('online', connection);
		window.addEventListener('offline', connection);
		void references();
		return () => {
			window.removeEventListener('online', connection);
			window.removeEventListener('offline', connection);
			batch?.stop();
		};
	});
	beforeNavigate(({ cancel }) => {
		if (applying) {
			cancel();
			message = 'Wait for the current import to finish, or stop it before leaving.';
		} else if (
			dirty &&
			!confirm(
				'Leave this import? Preview and row outcomes are held only in memory and will be lost. Check any created or unconfirmed rows before importing again.'
			)
		)
			cancel();
	});
	async function references() {
		try {
			const [homes, people] = await Promise.all([
				trpc.home.list.query(),
				trpc.client.list.query({})
			]);
			context = {
				homes: homes.map(({ id, name }) => ({ id, name })),
				people: people.map(({ id, name, homeId, active }) => ({ id, name, homeId, active }))
			};
		} catch {
			message = 'Connect to load accessible homes and people. Existing records are unchanged.';
		}
	}
	function clear() {
		rows = [];
		outcomes = [];
		batch = undefined;
		reviewed = false;
		attempted = false;
		message = '';
	}
	async function choose(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || busy || applying) return;
		if (
			dirty &&
			!confirm(
				'Replace this preview and its outcomes? First reconcile any created or unconfirmed rows.'
			)
		)
			return;
		clear();
		busy = true;
		try {
			if (file.size > CSV_LIMITS.bytes)
				throw new CsvImportError('Use a CSV file no larger than 256 KB.');
			let text: string;
			try {
				text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
			} catch {
				throw new CsvImportError('Save the file as UTF-8 CSV and select it again.');
			}
			const parsed = parseImportCsv(text);
			if (!online)
				throw new CsvImportError(
					'Reconnect to check accessible records before preparing a preview.'
				);
			const [homes, people] = await Promise.all([
				trpc.home.list.query(),
				trpc.client.list.query({})
			]);
			context = {
				homes: homes.map(({ id, name }) => ({ id, name })),
				people: people.map(({ id, name, homeId, active }) => ({ id, name, homeId, active }))
			};
			const preliminary = previewImport(kind, parsed, context);
			const existingKeys: string[] = [];
			if (kind !== 'people') {
				const ids = [
					...new Set(
						preliminary
							.filter((row) => !row.errors.length)
							.map((row) => (row.payload.kind === 'people' ? '' : row.payload.input.clientId))
					)
				];
				for (const clientId of ids) {
					if (kind === 'goals') {
						const goals = await trpc.goal.list.query({ clientId, includeStopped: true });
						if (goals.length > 500)
							throw new CsvImportError(
								'This person has too many goals for a reliable duplicate check. Use individual management instead.'
							);
						for (const goal of goals)
							existingKeys.push(importKey(kind, [clientId, goal.area, goal.text]));
					} else {
						const medications = await trpc.medication.list.query({
							clientId,
							includeStopped: true
						});
						if (medications.length > 500)
							throw new CsvImportError(
								'Too many medications for a reliable duplicate check. Use individual management instead.'
							);
						for (const medication of medications)
							existingKeys.push(
								importKey(kind, [clientId, medication.name, medication.dose, medication.route])
							);
					}
				}
			}
			rows = previewImport(kind, parsed, { ...context, existingKeys });
			batch = new ImportBatch(rows);
			outcomes = [...batch.outcomes];
			message = rows.some((row) => row.errors.length)
				? 'Fix all row issues in your source file and select it again. Nothing has been imported.'
				: 'Preview ready. Review every value and resolved destination before applying.';
		} catch (error) {
			message =
				error instanceof CsvImportError
					? error.message
					: 'Could not prepare this preview. Reconnect and check your permissions, then select the file again. Nothing has been imported.';
		} finally {
			busy = false;
		}
	}
	async function create(payload: ImportPayload): Promise<{ id: string }> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 20000);
		const options = { signal: controller.signal };
		try {
			if (payload.kind === 'people') return await trpc.client.create.mutate(payload.input, options);
			if (payload.kind === 'goals') return await trpc.goal.create.mutate(payload.input, options);
			return await trpc.medication.create.mutate(payload.input, options);
		} finally {
			clearTimeout(timer);
		}
	}
	async function apply() {
		if (
			!batch ||
			applying ||
			busy ||
			attempted ||
			errors ||
			!reviewed ||
			!online ||
			app.privacyLocked
		)
			return;
		if (
			!confirm(
				`Create ${rows.length} ${kind} records using these reviewed values? This cannot undo earlier rows if a later row fails.`
			)
		)
			return;
		applying = true;
		message = '';
		try {
			await batch.apply({
				online: () => online && !app.privacyLocked,
				create,
				changed: () => (outcomes = [...batch!.outcomes])
			});
			attempted = batch.started;
			message = outcomes.every((outcome) => outcome.status === 'created')
				? 'Import completed. Check the created records in management. Keep this outcome list until you finish reviewing.'
				: 'Import stopped. Created rows remain saved; unconfirmed rows may also have been created. Check management records before starting another preview. This preview will not retry attempted rows.';
		} finally {
			applying = false;
		}
	}
	function template() {
		const url = URL.createObjectURL(
			new Blob([IMPORT_HEADERS[kind].join(',') + '\r\n'], { type: 'text/csv' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `guad-${kind}-blank.csv`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<svelte:head><title>Review CSV imports · Guad</title></svelte:head>
<svelte:window
	onbeforeunload={(event) => {
		if (dirty || applying) event.preventDefault();
	}}
/>
<div class="stack">
	<a class="textbtn" href={resolve('/(app)/dashboard/reports')}>← Reports</a>
	<h1>Review CSV imports</h1>
	<p class="muted">
		Convert your export into one of these exact templates. The preview and outcomes stay in memory;
		the CSV file is never uploaded. Created records are saved normally. Leaving or closing loses the
		preview and outcomes.
	</p>
	<p class="callout warn">
		Import creates definitions and people, not signed notes or medication administration records.
		Review prescriptions and support plans with the responsible clinician. Duplicate checks are
		conservative; concurrent imports or re-uploading after a lost response can still create
		duplicates. Staff invitations are not imported here.
	</p>
	{#if !online}<p class="callout warn" role="status">
			Reconnect before preparing or applying an import. Your current preview remains in memory.
		</p>{/if}
	<div class="card pad stack">
		<label
			>Import type<select class="input" bind:value={kind} disabled={busy || applying || dirty}
				>{#each kinds as item (item)}<option value={item}
						>{item === 'people' ? 'People' : item === 'goals' ? 'Goals' : 'Medications'}</option
					>{/each}</select
			></label
		>
		<p>Required headers, in any order: <code>{IMPORT_HEADERS[kind].join(', ')}</code></p>
		{#if kind === 'medications'}<p class="muted">
				Separate scheduled times with semicolons, for example 07:00;19:00. Use scheduled times or
				as-needed instructions, never both.
			</p>{/if}
		<p class="muted">
			UTF-8 comma CSV, up to 256 KB and 100 data rows; maximum 4,000 characters per field. Quoted
			commas, line breaks and doubled quotes are supported. Formula-looking cells remain literal
			text.
		</p>
		<button class="btn sec" type="button" onclick={template}>Download blank template</button>
		<label
			>Select CSV file<input
				class="input"
				type="file"
				accept=".csv,text/csv"
				onchange={choose}
				disabled={busy || applying || !online}
			/></label
		>
		{#if busy}<p role="status">Checking the file and accessible records…</p>{/if}
	</div>
	<details class="card pad">
		<summary>Accessible IDs for your template</summary>
		<p class="muted">Copy the exact ID, not a name. Imports never guess a match.</p>
		{#if kind === 'people'}{#each context.homes as home (home.id)}<label
					>{home.name}<input
						class="input"
						readonly
						value={home.id}
						aria-label={`Home ID for ${home.name}`}
					/></label
				>{/each}{:else}{#each context.people.filter((person) => person.active) as person (person.id)}<label
					>{person.name} · {context.homes.find((home) => home.id === person.homeId)?.name ??
						'Home'}<input
						class="input"
						readonly
						value={person.id}
						aria-label={`Person ID for ${person.name}`}
					/></label
				>{/each}{/if}
	</details>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if rows.length}
		<h2>Preview: {rows.length} rows · {errors} rows need attention</h2>
		{#if applying}<p role="status">
				{outcomes.filter((outcome) => outcome.status === 'created').length} of {rows.length} records created.
				Keep this page open.
			</p>{/if}
		{#each rows as row, index (row.line)}<section
				class="card pad stack"
				aria-label={`CSV row ${row.line}`}
			>
				<h3>CSV line {row.line} → {row.target}</h3>
				<dl>
					{#each IMPORT_HEADERS[kind] as header, cell (header)}<div>
							<dt>{header}</dt>
							<dd>{row.values[cell] || '(blank)'}</dd>
						</div>{/each}
				</dl>
				{#each row.errors as issue (issue)}<p class="callout bad">{issue}</p>{/each}
				<p class="pill">{statusLabels[outcomes[index]?.status ?? 'pending']}</p>
				{#if outcomes[index]?.id}<p class="muted">
						Created record ID: <code data-testid="created-import-id">{outcomes[index].id}</code>
					</p>{/if}
			</section>{/each}
		<label class="check"
			><input
				type="checkbox"
				bind:checked={reviewed}
				disabled={applying || attempted || !!errors}
			/>I reviewed every value and destination and checked for duplicate records.</label
		>
		<div class="actions">
			<button
				class="btn"
				onclick={apply}
				disabled={busy || applying || attempted || !!errors || !reviewed || !online}
				>Apply reviewed import</button
			>{#if applying}<button class="btn sec" onclick={() => batch?.stop()}
					>Stop after current row</button
				>{:else}<button
					class="textbtn"
					onclick={() => {
						if (
							confirm(
								'Clear this preview and outcomes? First reconcile any created or unconfirmed rows.'
							)
						)
							clear();
					}}>Clear preview and outcomes</button
				>{/if}
		</div>
	{/if}
</div>

<style>
	details summary {
		cursor: pointer;
		min-height: 44px;
	}
	dl {
		margin: 0;
	}
	dl div {
		display: grid;
		grid-template-columns: minmax(100px, 1fr) minmax(0, 3fr);
		gap: 12px;
		padding: 6px 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	code {
		overflow-wrap: anywhere;
	}
	.check {
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 44px;
	}
</style>
