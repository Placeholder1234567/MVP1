<script lang="ts">
	// Staff management (frontend-spec-3.md §4.6). Supervisors see the roster;
	// admins invite people and change role, homes, certification and status.
	// Changes need a connection: they go straight to staff.* (tRPC).
	import LoadMore from '#lib/app/components/LoadMore.svelte';
	import { LIST_PAGE } from '#lib/domain/note-review.ts';
	import { onMount } from 'svelte';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { initialsOf } from '#lib/domain/people.ts';
	import { trpc } from '#lib/trpc.ts';
	import Skeleton from '#lib/app/Skeleton.svelte';

	type Staff = Awaited<ReturnType<typeof trpc.staff.list.query>>[number];
	type Role = Staff['role'];
	const app = useSession();
	const isAdmin = $derived(app.user.role === 'admin');
	const roles: Role[] = ['caregiver', 'supervisor', 'admin'];

	let staff = $state<Staff[]>([]);
	let showInactive = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let message = $state('');
	// null: no form open; '': adding; otherwise the profile being edited
	let editing = $state<string | null>(null);
	let name = $state('');
	let email = $state('');
	let role = $state<Role>('caregiver');
	let medCertified = $state(false);
	let homeIds = $state<string[]>([]);
	let active = $state(true);

	const homeName = (id: string) => app.homes.find((h) => h.id === id)?.name ?? 'Home';
	const describe = (p: Staff) =>
		[
			p.role[0].toUpperCase() + p.role.slice(1),
			p.medCertified ? 'med-certified' : '',
			(p.homeIds ?? []).map(homeName).join(', ')
		]
			.filter(Boolean)
			.join(' · ');
	let limit = $state(LIST_PAGE);
	const visible = $derived(staff.filter((p) => showInactive || p.active));

	async function load() {
		loading = true;
		try {
			staff = await trpc.staff.list.query({});
		} catch {
			message = 'Connect to load staff.';
		} finally {
			loading = false;
		}
	}
	onMount(load);

	function open(person?: Staff) {
		editing = person?.id ?? '';
		name = person?.name ?? '';
		email = person?.email ?? '';
		role = person?.role ?? 'caregiver';
		medCertified = person?.medCertified ?? false;
		homeIds = [...(person?.homeIds ?? [])];
		active = person?.active ?? true;
		message = '';
	}

	function toggleHome(id: string, on: boolean) {
		homeIds = on ? [...new Set([...homeIds, id])] : homeIds.filter((h) => h !== id);
	}

	async function resetMfa() {
		if (
			!editing ||
			!confirm(
				'Reset two-step sign-in? Their authenticator stops working, they are signed out everywhere, and they set it up again at their next sign-in. Only do this after confirming who they are.'
			)
		)
			return;
		saving = true;
		try {
			await trpc.staff.resetMfa.mutate({ id: editing });
			message = 'Two-step sign-in was reset. They will set it up again when they next sign in.';
			editing = null;
			await load();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not reset.';
		} finally {
			saving = false;
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		message = '';
		try {
			if (editing) {
				const wasActive = staff.find((p) => p.id === editing)?.active;
				if (
					wasActive &&
					!active &&
					!confirm(
						'Deactivate this person? They are signed out everywhere and can no longer sign in. Their records are kept.'
					)
				)
					return;
				await trpc.staff.update.mutate({ id: editing, role, medCertified, homeIds, active });
				message = 'Saved.';
			} else {
				await trpc.staff.invite.mutate({ email, name, role, homeIds, medCertified });
				message = `Invitation sent to ${email}. The link to set a password expires in an hour.`;
			}
			editing = null;
			await load();
		} catch (e) {
			// Service messages are written for people and carry no client data.
			message = e instanceof Error ? e.message : 'Could not save. Check your connection.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Staff · Guad</title></svelte:head>

<section class="stack" aria-label="Staff">
	<div class="spread">
		<h1>Staff</h1>
		{#if isAdmin}<button class="btn" disabled={saving} onclick={() => open()}>Add staff</button
			>{/if}
	</div>
	<label class="check"
		><input type="checkbox" bind:checked={showInactive} /> Show deactivated staff</label
	>
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if editing !== null}
		<form class="card pad stack" onsubmit={save}>
			<h2>{editing ? 'Edit staff member' : 'Add staff'}</h2>
			<fieldset class="stack" disabled={saving}>
				{#if !editing}
					<label>Full name<input class="input" required maxlength="100" bind:value={name} /></label>
					<label
						>Email<input
							class="input"
							type="email"
							required
							maxlength="254"
							autocomplete="off"
							bind:value={email}
						/></label
					>
				{:else}
					<p><b>{name}</b> · {email}</p>
				{/if}
				<fieldset class="stack">
					<legend>Role</legend>
					<div class="actions">
						{#each roles as r (r)}
							<label class="check"
								><input type="radio" name="role" value={r} bind:group={role} />
								{r[0].toUpperCase() + r.slice(1)}</label
							>
						{/each}
					</div>
				</fieldset>
				<label class="check"
					><input type="checkbox" bind:checked={medCertified} /> Medication certified</label
				>
				<fieldset class="stack">
					<legend>Homes they work at</legend>
					{#each app.homes.filter((h) => !h.archived_at || homeIds.includes(h.id)) as home (home.id)}
						<label class="check"
							><input
								type="checkbox"
								checked={homeIds.includes(home.id)}
								onchange={(e) => toggleHome(home.id, e.currentTarget.checked)}
							/>
							{home.name}{home.archived_at ? ' (archived)' : ''}</label
						>
					{/each}
				</fieldset>
				{#if editing}
					<label class="check"
						><input type="checkbox" bind:checked={active} /> Active (can sign in)</label
					>
				{:else}
					<p class="muted">They'll get an email with a link to set their password.</p>
				{/if}
				<div class="actions">
					<button class="btn" disabled={saving}>{editing ? 'Save' : 'Send invitation'}</button>
					<button type="button" class="btn sec" onclick={() => (editing = null)}>Cancel</button>
					{#if editing && editing !== app.user.profileId && staff.find((p) => p.id === editing)?.mfaEnabled}<button
							type="button"
							class="btn sec"
							onclick={resetMfa}>Reset two-step sign-in</button
						>{/if}
				</div>
			</fieldset>
		</form>
	{/if}

	{#if loading}<Skeleton label="Loading staff" />{:else}
		<div class="list card" role="list">
			{#each visible.slice(0, limit) as person (person.id)}
				<div class="row" role="listitem">
					<span class="avatar" aria-hidden="true">{person.initials || initialsOf(person.name)}</span
					>
					<span class="grow">
						<b
							>{person.name}{person.id === app.user.profileId ? ' (you)' : ''}{person.active
								? ''
								: ' · deactivated'}</b
						>
						<span class="muted">{describe(person)}</span>
					</span>
					{#if isAdmin}<button
							class="btn sec"
							disabled={saving}
							aria-label="Edit {person.name}"
							onclick={() => open(person)}>Edit</button
						>{/if}
				</div>
			{:else}
				<div class="row muted" role="listitem">No staff yet.</div>
			{/each}
		</div>
		<LoadMore
			shown={Math.min(limit, visible.length)}
			total={visible.length}
			onmore={() => (limit += LIST_PAGE)}
		/>
	{/if}
</section>
