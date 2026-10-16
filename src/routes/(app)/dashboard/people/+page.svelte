<script lang="ts">
	// Individual management (frontend-spec-3.md §4.7): the people the agency
	// supports, adding them and editing their details and health profile.
	// Day-to-day care records live on each person's page (/people/[id]).
	// Supervisors and admins; archiving is admin-only. Needs a connection.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';

	type Person = Awaited<ReturnType<typeof trpc.client.list.query>>[number];
	const app = useSession();
	const isAdmin = $derived(app.user.role === 'admin');

	let people = $state<Person[]>([]);
	let showArchived = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let message = $state('');
	let editing = $state<string | null>(null);
	let form = $state(blank());

	function blank() {
		return {
			name: '',
			homeId: '',
			info: '',
			behaviors: '',
			dob: '',
			allergies: '',
			conditions: '',
			diet: '',
			doctor: '',
			guardian: ''
		};
	}

	const homeName = (id: string) => app.homes.find((h) => h.id === id)?.name ?? 'Home';
	const visible = $derived(people.filter((p) => showArchived || p.active));

	async function load() {
		loading = true;
		try {
			people = await trpc.client.list.query({});
		} catch {
			message = 'Connect to load people.';
		} finally {
			loading = false;
		}
	}
	onMount(load);

	async function open(person?: Person) {
		message = '';
		if (!person) {
			form = { ...blank(), homeId: app.homes[0]?.id ?? '' };
			editing = '';
			return;
		}
		try {
			const full = await trpc.client.get.query({ id: person.id });
			const h = full.healthInfo;
			form = {
				name: full.name,
				homeId: full.homeId,
				info: full.info ?? '',
				behaviors: (full.behaviors ?? []).join(', '),
				dob: h?.dob ?? '',
				allergies: h?.allergies ?? '',
				conditions: h?.conditions ?? '',
				diet: h?.diet ?? '',
				doctor: h?.doctor ?? '',
				guardian: h?.guardian ?? ''
			};
			editing = person.id;
		} catch {
			message = 'Connect to open this person.';
		}
	}

	const orNull = (v: string) => v.trim() || null;
	const behaviorList = () =>
		form.behaviors
			.split(',')
			.map((b) => b.trim())
			.filter(Boolean);
	const health = () => ({
		dob: form.dob || null,
		allergies: orNull(form.allergies),
		conditions: orNull(form.conditions),
		diet: orNull(form.diet),
		doctor: orNull(form.doctor),
		guardian: orNull(form.guardian)
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		message = '';
		try {
			if (editing) {
				const before = people.find((p) => p.id === editing);
				if (
					before &&
					before.homeId !== form.homeId &&
					!confirm('Move this person to another home? Their care records move with them.')
				)
					return;
				await trpc.client.update.mutate({
					id: editing,
					name: form.name,
					homeId: form.homeId,
					info: orNull(form.info),
					behaviors: behaviorList()
				});
				await trpc.client.updateHealth.mutate({ clientId: editing, ...health() });
			} else {
				await trpc.client.create.mutate({
					name: form.name,
					homeId: form.homeId,
					info: form.info.trim() || undefined,
					behaviors: behaviorList(),
					healthInfo: health()
				});
			}
			message = 'Saved.';
			editing = null;
			await load();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not save. Check your connection.';
		} finally {
			saving = false;
		}
	}

	async function archive() {
		if (!editing || !confirm('Archive this person? Their records are kept; they leave the active lists.'))
			return;
		saving = true;
		try {
			await trpc.client.archive.mutate({ id: editing });
			editing = null;
			await load();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not archive.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>People · Guad</title></svelte:head>

<section class="stack" aria-label="People">
	<div class="spread">
		<h1>People</h1>
		<button class="btn" disabled={saving || !app.homes.length} onclick={() => open()}>Add a person</button>
	</div>
	<label class="check"><input type="checkbox" bind:checked={showArchived} /> Show archived</label>
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if editing !== null}
		<form class="card pad stack personForm" onsubmit={save}>
			<h2>{editing ? 'Edit details' : 'Add a person'}</h2>
			<fieldset class="stack" disabled={saving}>
				<label>Full name<input class="input" required maxlength="100" bind:value={form.name} /></label>
				<label
					>Home<select class="input" required bind:value={form.homeId}
						>{#each app.homes as home (home.id)}<option value={home.id}>{home.name}</option>{/each}</select
					></label
				>
				<label
					>What staff should know<textarea class="input" maxlength="4000" rows="3" bind:value={form.info}
					></textarea></label
				>
				<div class="grid2">
					<label>Date of birth<input class="input" type="date" bind:value={form.dob} /></label>
					<label>Allergies<input class="input" maxlength="2000" bind:value={form.allergies} /></label>
				</div>
				<label>Conditions<input class="input" maxlength="2000" bind:value={form.conditions} /></label>
				<label>Diet<input class="input" maxlength="2000" bind:value={form.diet} /></label>
				<div class="grid2">
					<label>Doctor<input class="input" maxlength="500" bind:value={form.doctor} /></label>
					<label
						>Guardian or contact<input class="input" maxlength="500" bind:value={form.guardian} /></label
					>
				</div>
				<label
					>Behaviors in support plan<input
						class="input"
						placeholder="Separate with commas"
						bind:value={form.behaviors}
					/></label
				>
				<div class="actions">
					<button class="btn">Save</button>
					<button type="button" class="btn sec" onclick={() => (editing = null)}>Cancel</button>
					{#if editing && isAdmin}<button type="button" class="btn sec" onclick={archive}
							>Archive</button
						>{/if}
				</div>
			</fieldset>
		</form>
	{/if}

	{#if loading}<p class="muted">Loading people…</p>{:else}
		<div class="list card" role="list">
			{#each visible as person (person.id)}
				<div class="row" role="listitem">
					<span class="avatar" aria-hidden="true">{person.initials ?? '?'}</span>
					<span class="grow">
						<a href={resolve('/(app)/people/[id]', { id: person.id })}><b>{person.name}</b></a>
						<span>{homeName(person.homeId)}{person.active ? '' : ' · archived'}</span>
					</span>
					<button class="btn sec" disabled={saving} aria-label="Edit {person.name}" onclick={() => open(person)}
						>Edit</button
					>
				</div>
			{:else}
				<div class="row muted" role="listitem">No one yet. Add the people your agency supports.</div>
			{/each}
		</div>
	{/if}
</section>
