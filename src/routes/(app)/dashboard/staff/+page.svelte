<script lang="ts">
	// Staff management (frontend-spec-3.md §4.6). Supervisors see the roster;
	// admins invite people and change role, homes, certification and status.
	// Changes need a connection: they go straight to staff.* (tRPC).
	import LoadMore from '#lib/app/components/LoadMore.svelte';
	import { LIST_PAGE } from '#lib/domain/note-review.ts';
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { ReportJobGuard, reportCanConnect } from '#lib/app/report-job.ts';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { initialsOf } from '#lib/domain/people.ts';
	import { isDormant } from '#lib/domain/access-review.ts';
	import { trpc } from '#lib/trpc.ts';
	import Skeleton from '#lib/app/Skeleton.svelte';
	import StaffCredentials from '#lib/app/StaffCredentials.svelte';

	type Staff = Awaited<ReturnType<typeof trpc.staff.list.query>>[number];
	type Role = Staff['role'];
	const app = useSession();
	const isAdmin = $derived(app.user.role === 'admin');
	const roles: Role[] = ['caregiver', 'supervisor', 'admin'];

	let staff = $state<Staff[]>([]);
	let showInactive = $state(false);
	let loading = $state(false);
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
	/** Admins see when each person last signed in, for the access review. */
	function lastSignIn(p: Staff) {
		const at = p.lastSignInAt ? new Date(p.lastSignInAt) : null;
		const when = at
			? `Last signed in ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
			: 'Never signed in';
		return isDormant({ ...p, createdAt: new Date(p.createdAt), lastSignInAt: at }, new Date())
			? `${when} · unused 90+ days`
			: when;
	}
	let limit = $state(LIST_PAGE);
	const visible = $derived(staff.filter((p) => showInactive || p.active));

	let online = $state(false);
	let pageVisible = $state(false);
	const canConnect = $derived(
		app.user.role !== 'caregiver' && reportCanConnect(online, pageVisible, app.privacyLocked)
	);
	const guard = new ReportJobGuard();
	const controllers: Partial<Record<'list' | 'change', AbortController>> = {};
	const context = () =>
		JSON.stringify([
			app.user.agencyId,
			app.user.profileId,
			app.user.role,
			app.user.homeIds,
			app.user.features,
			app.privacyLocked
		]);
	function abortAll() {
		for (const controller of Object.values(controllers)) controller?.abort();
		loading = false;
		saving = false;
	}
	function close() {
		editing = null;
		name = '';
		email = '';
		role = 'caregiver';
		medCertified = false;
		homeIds = [];
		active = true;
	}
	function forget() {
		abortAll();
		staff = [];
		limit = LIST_PAGE;
		message = '';
		close();
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
			pageVisible = document.visibilityState === 'visible';
			if (!online || !pageVisible) {
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
	async function load() {
		if (!canConnect) return;
		const operation = begin('list');
		loading = true;
		try {
			const result = await trpc.staff.list.query({}, { signal: operation.signal });
			if (operation.valid()) staff = result;
		} catch {
			if (operation.valid()) message = 'Connect to load staff.';
		} finally {
			if (operation.valid()) loading = false;
		}
	}

	function open(person?: Staff) {
		if (!isAdmin || !canConnect || saving) return;
		editing = person?.id ?? '';
		name = person?.name ?? '';
		email = person?.email ?? '';
		role = person?.role ?? 'caregiver';
		medCertified = person?.medCertified ?? false;
		homeIds = [...(person?.homeIds ?? [])];
		active = person?.active ?? true;
		message = '';
	}

	/** A medication certificate just recorded or removed may have changed med_certified. */
	async function refreshCertified() {
		const id = editing;
		await load();
		const person = staff.find((p) => p.id === id);
		if (person && editing === id) medCertified = person.medCertified;
	}

	function toggleHome(id: string, on: boolean) {
		homeIds = on ? [...new Set([...homeIds, id])] : homeIds.filter((h) => h !== id);
	}

	async function resetMfa() {
		if (
			!isAdmin ||
			!canConnect ||
			saving ||
			!editing ||
			!confirm(
				'Reset two-step sign-in? Their authenticator stops working, they are signed out everywhere, and they set it up again at their next sign-in. Only do this after confirming who they are.'
			)
		)
			return;
		const operation = begin('change');
		saving = true;
		try {
			await trpc.staff.resetMfa.mutate({ id: editing }, { signal: operation.signal });
			if (!operation.valid()) return;
			message = 'Two-step sign-in was reset. They will set it up again when they next sign in.';
			editing = null;
			await load();
		} catch (e) {
			if (operation.valid()) message = e instanceof Error ? e.message : 'Could not reset.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!isAdmin || !canConnect || saving || editing === null) return;
		const operation = begin('change');
		const submittedEmail = email;
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
				await trpc.staff.update.mutate(
					{ id: editing, role, medCertified, homeIds, active },
					{ signal: operation.signal }
				);
				if (!operation.valid()) return;
				message = 'Saved.';
			} else {
				await trpc.staff.invite.mutate(
					{ email: submittedEmail, name, role, homeIds, medCertified },
					{ signal: operation.signal }
				);
				if (!operation.valid()) return;
				message = `Invitation sent to ${submittedEmail}. The link to set a password expires in an hour.`;
			}
			editing = null;
			await load();
		} catch (e) {
			// Service messages are written for people and carry no client data.
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Could not save. Check your connection.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}
</script>

<svelte:head><title>Staff · Guad</title></svelte:head>

<section class="stack" aria-label="Staff">
	<div class="spread">
		<h1>Staff</h1>
		{#if isAdmin}<button class="btn" disabled={saving || !canConnect} onclick={() => open()}
				>Add staff</button
			>{/if}
	</div>
	<label class="check"
		><input type="checkbox" bind:checked={showInactive} /> Show deactivated staff</label
	>
	<p class="muted">
		Interrupted changes may still complete. Refresh staff before retrying an invitation or account
		change.
	</p>
	<button type="button" class="btn sec" disabled={loading || saving || !canConnect} onclick={load}
		>Refresh staff</button
	>
	{#if !canConnect}<p class="muted" role="status">
			Connect with this workspace visible and unlocked to manage staff.
		</p>{/if}
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if editing !== null}
		<form class="card pad stack" onsubmit={save}>
			<h2>{editing ? 'Edit staff member' : 'Add staff'}</h2>
			<fieldset class="stack" disabled={saving || !canConnect}>
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
				{#if editing}<p class="muted s13">
						Recording their medication administration certificate below sets this; it turns off on
						its own when the certificate lapses.
					</p>{/if}
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
					<button class="btn" disabled={saving || !canConnect}
						>{editing ? 'Save' : 'Send invitation'}</button
					>
					<button type="button" class="btn sec" onclick={close}>Cancel</button>
					{#if editing && editing !== app.user.profileId && staff.find((p) => p.id === editing)?.mfaEnabled}<button
							type="button"
							class="btn sec"
							onclick={resetMfa}>Reset two-step sign-in</button
						>{/if}
				</div>
			</fieldset>
		</form>
		{#if editing}<StaffCredentials
				profileId={editing}
				canEdit={isAdmin && canConnect}
				onsaved={refreshCertified}
			/>{/if}
	{/if}

	{#if canConnect && editing === null}<StaffCredentials
			attentionOnly
			title="Expiring training and certifications"
		/>{/if}

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
						{#if isAdmin && person.active}<span class="muted s13">{lastSignIn(person)}</span>{/if}
					</span>
					{#if isAdmin}<button
							class="btn sec"
							disabled={saving || !canConnect}
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
