<script lang="ts">
	// Agency settings (frontend-spec-3.md §4.8), admins only: name, charting
	// preset (labels and form order only), time zone, MFA for caregivers, and
	// homes with their clock-in geofence. Needs a connection.
	import { onMount, onDestroy } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { ReportJobGuard, reportCanConnect } from '#lib/app/report-job.ts';
	import {
		SESSION_MINUTES_DEFAULT,
		SESSION_MINUTES_MIN,
		sessionMinutes
	} from '#lib/domain/session-length.ts';
	import { trpc } from '#lib/trpc.ts';
	import ControlledRulesSettings from '#lib/app/ControlledRulesSettings.svelte';
	import MaintenanceNotice from '#lib/app/MaintenanceNotice.svelte';
	import NotificationOverridesSettings from '#lib/app/NotificationOverridesSettings.svelte';
	import IncidentRulesSettings from '#lib/app/IncidentRulesSettings.svelte';
	import MessagingUsage from '#lib/app/MessagingUsage.svelte';

	type Agency = Awaited<ReturnType<typeof trpc.agency.get.query>>;
	type Home = Awaited<ReturnType<typeof trpc.home.list.query>>[number];

	let agency = $state<Agency>();
	let homes = $state<Home[]>([]);
	let message = $state('');
	let saving = $state(false);
	let name = $state('');
	let preset = $state<'therap' | 'default'>('default');
	let timezone = $state('');
	// security.md: 12 hours by default, down to 15 minutes.
	const SESSION_CHOICES: [number, string][] = [
		[SESSION_MINUTES_DEFAULT, '12 hours (default)'],
		[8 * 60, '8 hours'],
		[4 * 60, '4 hours'],
		[60, '1 hour'],
		[30, '30 minutes'],
		[SESSION_MINUTES_MIN, '15 minutes']
	];
	let caregiverMfa = $state(false);
	let sessionLength = $state(String(SESSION_MINUTES_DEFAULT));
	let editingHome = $state<string | null>(null);
	let home = $state({ name: '', address: '', lat: '', lng: '', radius: '150' });

	const app = useSession();
	let online = $state(false);
	let pageVisible = $state(false);
	let loading = $state(false);
	// Child editors belong to the snapshot that mounted them, including their
	// completion callbacks. Removing them prevents old feedback resurfacing.
	let childView = $state<{ reload: () => void } | null>(null);
	const canConnect = $derived(
		app.user.role === 'admin' && reportCanConnect(online, pageVisible, app.privacyLocked)
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
		childView = null;
	}
	function forget() {
		abortAll();
		agency = undefined;
		homes = [];
		message = '';
		name = '';
		preset = 'default';
		timezone = '';
		caregiverMfa = false;
		sessionLength = String(SESSION_MINUTES_DEFAULT);
		editingHome = null;
		home = { name: '', address: '', lat: '', lng: '', radius: '150' };
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
		if (!canConnect || saving) return;
		const operation = begin('list');
		loading = true;
		childView = null;
		try {
			const [nextAgency, nextHomes] = await Promise.all([
				trpc.agency.get.query(undefined, { signal: operation.signal }),
				trpc.home.list.query(undefined, { signal: operation.signal })
			]);
			if (!operation.valid()) return;
			agency = nextAgency;
			homes = nextHomes;
			name = agency.name;
			preset = agency.chartingPreset === 'therap' ? 'therap' : 'default';
			timezone = agency.timezone ?? '';
			const roles = (agency.settings as { mfa_required_roles?: string[] }).mfa_required_roles;
			caregiverMfa = Array.isArray(roles) && roles.includes('caregiver');
			sessionLength = String(sessionMinutes(agency.settings));
			childView = {
				reload: () => {
					if (operation.valid()) void load();
				}
			};
		} catch {
			if (operation.valid()) message = 'Connect to load settings.';
		} finally {
			if (operation.valid()) loading = false;
		}
	}

	async function saveAgency(event: SubmitEvent) {
		event.preventDefault();
		if (!canConnect || saving || loading || !agency) return;
		const operation = begin('change');
		saving = true;
		message = '';
		try {
			await trpc.agency.update.mutate(
				{
					name,
					chartingPreset: preset,
					timezone,
					settings: {
						mfa_required_roles: caregiverMfa ? ['caregiver'] : [],
						session_minutes: Number(sessionLength)
					}
				},
				{ signal: operation.signal }
			);
			if (!operation.valid()) return;
			message = 'Agency settings saved. Labels update on the next page load.';
			saving = false;
			await load();
		} catch (e) {
			if (operation.valid()) message = e instanceof Error ? e.message : 'Could not save.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}

	function openHome(h?: Home) {
		if (!canConnect || saving || loading) return;
		editingHome = h?.id ?? '';
		home = {
			name: h?.name ?? '',
			address: h?.address ?? '',
			lat: h?.lat?.toString() ?? '',
			lng: h?.lng?.toString() ?? '',
			radius: (h?.radius ?? 150).toString()
		};
	}

	async function setArchived(h: Home, archive: boolean) {
		if (!canConnect || saving || loading) return;
		if (
			archive &&
			!confirm(
				`Archive ${h.name}? Its records stay, read-only. No one can clock in, be scheduled, admitted or assigned there until it is restored.`
			)
		)
			return;
		const operation = begin('change');
		saving = true;
		message = '';
		try {
			if (archive) await trpc.home.archive.mutate({ id: h.id }, { signal: operation.signal });
			else await trpc.home.restore.mutate({ id: h.id }, { signal: operation.signal });
			if (!operation.valid()) return;
			message = archive ? `${h.name} archived.` : `${h.name} restored.`;
			saving = false;
			await load();
		} catch (e) {
			if (operation.valid())
				message = e instanceof Error ? e.message : 'Could not change the home.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}

	async function saveHome(event: SubmitEvent) {
		event.preventDefault();
		if (!canConnect || saving || loading || !agency) return;
		const operation = begin('change');
		saving = true;
		message = '';
		const num = (v: string) => (v.trim() === '' ? null : Number(v));
		const data = {
			name: home.name,
			address: home.address.trim() || null,
			lat: num(home.lat),
			lng: num(home.lng),
			radius: Number(home.radius)
		};
		try {
			if (editingHome)
				await trpc.home.update.mutate({ id: editingHome, ...data }, { signal: operation.signal });
			else await trpc.home.create.mutate(data, { signal: operation.signal });
			if (!operation.valid()) return;
			editingHome = null;
			message = 'Home saved. Geofence changes apply to future clock-ins.';
			saving = false;
			await load();
		} catch (e) {
			if (operation.valid()) message = e instanceof Error ? e.message : 'Could not save the home.';
		} finally {
			if (operation.valid()) saving = false;
		}
	}
</script>

<svelte:head><title>Setup · Guad</title></svelte:head>

<section class="stack" aria-label="Agency setup">
	<h1>Setup</h1>
	<p class="muted">
		Interrupted changes may still complete. Refresh settings before retrying a save or announcement.
	</p>
	<button type="button" class="btn sec" disabled={loading || saving || !canConnect} onclick={load}
		>Refresh settings</button
	>
	{#if !canConnect}<p class="muted" role="status">
			Connect with this workspace visible and unlocked to manage settings.
		</p>{/if}
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if agency}
		<form class="card pad stack" onsubmit={saveAgency}>
			<h2>Agency</h2>
			<fieldset class="stack" disabled={saving || loading || !canConnect}>
				<label>Agency name<input class="input" required maxlength="100" bind:value={name} /></label>
				<fieldset class="stack">
					<legend>Charting terms</legend>
					<label class="check"
						><input type="radio" name="preset" value="default" bind:group={preset} /> Standard (Shift
						note, Goals, Medications)</label
					>
					<label class="check"
						><input type="radio" name="preset" value="therap" bind:group={preset} /> Therap-style (T-Log,
						ISP Data, eMAR)</label
					>
					<p class="muted">Only names and form order change. Records stay the same.</p>
				</fieldset>
				<label
					>Time zone<input
						class="input"
						required
						placeholder="America/New_York"
						bind:value={timezone}
					/></label
				>
				<label class="check"
					><input type="checkbox" bind:checked={caregiverMfa} /> Require two-step sign-in for caregivers
					too</label
				>
				<label
					>Sign staff out after<select class="input" bind:value={sessionLength}
						>{#each SESSION_CHOICES as [minutes, label] (minutes)}<option value={String(minutes)}
								>{label}</option
							>{/each}</select
					></label
				>
				<p class="muted">
					Applies from each person's next sign-in. The app also locks with the device PIN when it's
					been in the background.
				</p>
				<p class="muted">
					Admins always need two-step sign-in; supervisors after 30 days. Your plan:
					{agency.subscriptionTier}.
				</p>
				<div class="actions"><button class="btn">Save agency settings</button></div>
			</fieldset>
		</form>

		<div class="spread">
			<h2>Homes</h2>
			<button class="btn sec" disabled={saving || loading || !canConnect} onclick={() => openHome()}
				>Add a home</button
			>
		</div>
		{#if editingHome !== null}
			<form class="card pad stack" onsubmit={saveHome}>
				<h3>{editingHome ? 'Edit home' : 'Add a home'}</h3>
				<fieldset class="stack" disabled={saving || loading || !canConnect}>
					<label>Name<input class="input" required maxlength="100" bind:value={home.name} /></label>
					<label>Address<input class="input" maxlength="300" bind:value={home.address} /></label>
					<div class="grid2">
						<label
							>Latitude<input
								class="input"
								type="number"
								step="any"
								min="-90"
								max="90"
								bind:value={home.lat}
							/></label
						>
						<label
							>Longitude<input
								class="input"
								type="number"
								step="any"
								min="-180"
								max="180"
								bind:value={home.lng}
							/></label
						>
					</div>
					<label
						>Clock-in radius (meters)<input
							class="input"
							type="number"
							required
							min="25"
							max="5000"
							step="1"
							bind:value={home.radius}
						/></label
					>
					<div class="actions">
						<button class="btn">Save home</button>
						<button type="button" class="btn sec" onclick={() => (editingHome = null)}
							>Cancel</button
						>
					</div>
				</fieldset>
			</form>
		{/if}
		<div class="list card" role="list">
			{#each homes as h (h.id)}
				<div class="row" role="listitem">
					<span class="grow"
						><b>{h.name}</b>{#if h.archivedAt}
							<span class="pill">Archived</span>{/if}<span
							>{h.address ?? 'No address'} · clock-in radius {h.radius ?? 150} m</span
						></span
					>
					{#if !h.archivedAt}<button
							class="btn sec"
							disabled={saving || loading || !canConnect}
							aria-label="Edit {h.name}"
							onclick={() => openHome(h)}>Edit</button
						>{/if}
					<button
						class="btn sec"
						disabled={saving || loading || !canConnect}
						aria-label="{h.archivedAt ? 'Restore' : 'Archive'} {h.name}"
						onclick={() => setArchived(h, !h.archivedAt)}
						>{h.archivedAt ? 'Restore' : 'Archive'}</button
					>
				</div>
			{:else}
				<div class="row muted" role="listitem">No homes yet.</div>
			{/each}
		</div>
		{#if childView}
			{#key childView}
				<fieldset class="stack" disabled={saving || loading || !canConnect}>
					<ControlledRulesSettings settings={agency.settings} onSaved={childView.reload} />
					<IncidentRulesSettings settings={agency.settings} onSaved={childView.reload} />
					<NotificationOverridesSettings settings={agency.settings} onSaved={childView.reload} />
					<MessagingUsage />
					<MaintenanceNotice timezone={agency.timezone ?? 'America/New_York'} />
				</fieldset>
			{/key}
		{/if}
	{/if}
</section>
