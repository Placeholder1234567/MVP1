<script lang="ts">
	// Search and quick navigation (frontend-spec-3.md §7.4, §13 item 38):
	// Cmd/Ctrl+K or the app bar's Search button. Searches the records already
	// on this device (domain/search.ts), so it works offline and nothing typed
	// leaves the device.
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useSession, parseJson } from '#lib/app/session.svelte.ts';
	import { SEARCH_LABELS, SEARCH_ORDER, searchItems, type SearchItem } from '#lib/domain/index.ts';

	let { pages }: { pages: { href: string; label: string }[] } = $props();
	const app = useSession();
	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let open = $state(false);
	let query = $state('');
	let active = $state(0);

	const manager = $derived(app.user.role !== 'caregiver');
	const personHref = (id: string) =>
		manager
			? resolve('/(app)/dashboard/people/[id]', { id })
			: resolve('/(app)/people/[id]', { id });

	// Built only while the palette is open.
	const items = $derived.by((): SearchItem[] => {
		if (!open) return [];
		const people = new Map(app.people.map((p) => [p.id, p.name ?? '']));
		const homes = new Map(app.homes.map((h) => [h.id, h.name ?? '']));
		const out: SearchItem[] = pages.map((p) => ({
			kind: 'page',
			id: p.href,
			title: p.label,
			detail: 'Page',
			href: resolve(('/(app)' + p.href) as '/(app)/today')
		}));
		for (const p of app.people)
			out.push({
				kind: 'person',
				id: p.id,
				title: p.name ?? '',
				detail: homes.get(p.home_id ?? '') ?? '',
				href: personHref(p.id)
			});
		if (manager)
			for (const s of app.staff.filter((s) => s.active))
				out.push({
					kind: 'staff',
					id: s.id,
					title: s.name ?? '',
					detail: s.role ?? '',
					href: resolve('/(app)/dashboard/staff')
				});
		for (const n of app.notes) {
			const content = Object.values(parseJson<Record<string, unknown>>(n.content, {}))
				.filter((v) => typeof v === 'string')
				.join(' ');
			out.push({
				kind: 'note',
				id: n.id,
				title: `${n.type === 'behavior' ? app.labels.behavior : app.labels.shift} · ${people.get(n.client_id ?? '') ?? ''}`,
				detail: `${n.day ?? ''} · ${n.status ?? ''}`,
				href: resolve('/(app)/notes/[id]', { id: n.id }),
				text: content
			});
		}
		for (const m of app.medications.filter((m) => !m.stopped_at))
			out.push({
				kind: 'medication',
				id: m.id,
				title: m.name ?? '',
				detail: people.get(m.client_id ?? '') ?? '',
				href: manager
					? personHref(m.client_id ?? '')
					: resolve('/(app)/people/[id]/medications', { id: m.client_id ?? '' })
			});
		for (const i of app.incidents)
			out.push({
				kind: 'incident',
				id: i.id,
				title: `${i.type ?? 'Incident'} · ${people.get(i.client_id ?? '') ?? ''}`,
				detail: `${(i.occurred_at ?? i.created_at ?? '').slice(0, 10)} · ${i.status ?? ''}`,
				href: personHref(i.client_id ?? '')
			});
		for (const g of app.goals.filter((g) => !g.stopped_at))
			out.push({
				kind: 'goal',
				id: g.id,
				title: g.text ?? '',
				detail: people.get(g.client_id ?? '') ?? '',
				href: personHref(g.client_id ?? '')
			});
		return out.filter((i) => i.title.trim());
	});
	const groups = $derived(
		searchItems(items, query, SEARCH_ORDER[manager ? 'manager' : 'caregiver'])
	);
	const flat = $derived(groups.flatMap((g) => g.items));
	const optionId = (i: number) => `search-option-${i}`;

	export async function show() {
		query = '';
		active = 0;
		open = true;
		await tick();
		dialog?.showModal();
		input?.focus();
	}
	function close() {
		dialog?.close();
	}
	async function choose(item: SearchItem | undefined) {
		if (!item) return;
		close();
		// Every href above was built with resolve().
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		await goto(item.href);
	}
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!flat.length) return;
			active = (active + (event.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length;
			document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
		} else if (event.key === 'Escape') {
			// A search field's own Escape only clears the text; close in one press.
			event.preventDefault();
			close();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			void choose(flat[active]);
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			if (open) close();
			else void show();
		}
	}}
/>

<button class="textbtn" onclick={show} aria-keyshortcuts="Control+K Meta+K">Search</button>
{#if open}
	<dialog
		class="palette"
		bind:this={dialog}
		aria-label="Search"
		onclose={() => (open = false)}
		onclick={(event) => {
			// A click on the backdrop (the dialog itself, outside the panel) closes it.
			if (event.target === dialog) close();
		}}
	>
		<div class="panel">
			<div class="bar">
				<input
					bind:this={input}
					bind:value={query}
					oninput={() => (active = 0)}
					{onkeydown}
					class="input"
					type="search"
					role="combobox"
					aria-label="Search people, notes, medications and pages"
					aria-expanded={flat.length > 0}
					aria-controls="search-results"
					aria-activedescendant={flat.length ? optionId(active) : undefined}
					aria-autocomplete="list"
					autocomplete="off"
					spellcheck="false"
					placeholder="Search people, notes, medications…"
				/>
				<button class="textbtn" onclick={close}>Close</button>
			</div>
			<div id="search-results" role="listbox" aria-label="Search results" class="results">
				{#each groups as group (group.kind)}
					{@const offset = flat.indexOf(group.items[0])}
					<div role="group" aria-labelledby={`search-group-${group.kind}`}>
						<p class="eyebrow" id={`search-group-${group.kind}`} role="presentation">
							{SEARCH_LABELS[group.kind]}
						</p>
						{#each group.items as item, i (item.kind + item.id)}
							<div
								id={optionId(offset + i)}
								role="option"
								tabindex="-1"
								aria-selected={active === offset + i}
								class="option"
								onclick={() => choose(item)}
								onkeydown={(e) => e.key === 'Enter' && choose(item)}
								onmousemove={() => (active = offset + i)}
							>
								<b>{item.title}</b>{#if item.detail}<span class="muted">{item.detail}</span>{/if}
							</div>
						{/each}
						{#if group.more}<p class="muted more">
								{group.more} more {SEARCH_LABELS[group.kind].toLowerCase()} match. Add a word to narrow
								the search.
							</p>{/if}
					</div>
				{/each}
			</div>
			<p class="muted hint" role="status">
				{query.trim()
					? flat.length
						? `${flat.length} shown. Use the arrow keys and Enter.`
						: 'Nothing on this device matches.'
					: 'Searches the records saved on this device, so it works offline.'}
			</p>
		</div>
	</dialog>
{/if}

<style>
	.palette {
		margin: 12vh auto auto;
		width: min(640px, calc(100% - 32px));
		max-height: 70vh;
		border: 0;
		border-radius: 20px;
		padding: 0;
		background: var(--card);
		color: var(--ink);
		box-shadow: var(--shadow);
	}
	.palette::backdrop {
		background: rgba(28, 27, 75, 0.45);
	}
	.panel {
		display: flex;
		flex-direction: column;
		max-height: 70vh;
	}
	.bar {
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 14px 14px 10px;
		border-bottom: 1px solid var(--line);
	}
	.bar .input {
		flex: 1;
		margin: 0;
	}
	.results {
		overflow-y: auto;
		padding: 6px 8px 8px;
	}
	.results .eyebrow {
		margin: 12px 8px 4px;
	}
	.option {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 44px;
		justify-content: center;
		padding: 8px 10px;
		border-radius: 12px;
		cursor: pointer;
	}
	.option[aria-selected='true'] {
		background: var(--sky);
	}
	.option .muted {
		font-size: 13px;
	}
	.more {
		font-size: 13px;
		margin: 2px 10px 6px;
	}
	.hint {
		font-size: 13px;
		margin: 0;
		padding: 8px 16px 12px;
		border-top: 1px solid var(--line);
	}
	/* Phones: full screen (frontend-spec-3.md §7.4). */
	@media (max-width: 640px) {
		.palette {
			margin: 0;
			width: 100%;
			max-width: none;
			height: 100%;
			max-height: none;
			border-radius: 0;
		}
		.panel {
			height: 100%;
			max-height: none;
		}
		.results {
			flex: 1;
		}
	}
</style>
