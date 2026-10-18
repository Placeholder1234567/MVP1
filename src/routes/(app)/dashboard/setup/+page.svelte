<script lang="ts">
	// Agency settings (frontend-spec-3.md §4.8), admins only: name, charting
	// preset (labels and form order only), time zone, MFA for caregivers, and
	// homes with their clock-in geofence. Needs a connection.
	import { onMount } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import ControlledRulesSettings from '#lib/app/ControlledRulesSettings.svelte';
	import MaintenanceNotice from '#lib/app/MaintenanceNotice.svelte';
	import IncidentRulesSettings from '#lib/app/IncidentRulesSettings.svelte';

	type Agency = Awaited<ReturnType<typeof trpc.agency.get.query>>;
	type Home = Awaited<ReturnType<typeof trpc.home.list.query>>[number];

	let agency = $state<Agency>();
	let homes = $state<Home[]>([]);
	let message = $state('');
	let saving = $state(false);
	let name = $state('');
	let preset = $state<'therap' | 'default'>('default');
	let timezone = $state('');
	let caregiverMfa = $state(false);
	let editingHome = $state<string | null>(null);
	let home = $state({ name: '', address: '', lat: '', lng: '', radius: '150' });

	async function load() {
		try {
			[agency, homes] = await Promise.all([trpc.agency.get.query(), trpc.home.list.query()]);
			name = agency.name;
			preset = agency.chartingPreset === 'therap' ? 'therap' : 'default';
			timezone = agency.timezone ?? '';
			const roles = (agency.settings as { mfa_required_roles?: string[] }).mfa_required_roles;
			caregiverMfa = Array.isArray(roles) && roles.includes('caregiver');
		} catch {
			message = 'Connect to load settings.';
		}
	}
	onMount(load);

	async function saveAgency(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		message = '';
		try {
			await trpc.agency.update.mutate({
				name,
				chartingPreset: preset,
				timezone,
				settings: { mfa_required_roles: caregiverMfa ? ['caregiver'] : [] }
			});
			message = 'Agency settings saved. Labels update on the next page load.';
			await load();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not save.';
		} finally {
			saving = false;
		}
	}

	function openHome(h?: Home) {
		editingHome = h?.id ?? '';
		home = {
			name: h?.name ?? '',
			address: h?.address ?? '',
			lat: h?.lat?.toString() ?? '',
			lng: h?.lng?.toString() ?? '',
			radius: (h?.radius ?? 150).toString()
		};
	}

	async function saveHome(event: SubmitEvent) {
		event.preventDefault();
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
			if (editingHome) await trpc.home.update.mutate({ id: editingHome, ...data });
			else await trpc.home.create.mutate(data);
			editingHome = null;
			message = 'Home saved. Geofence changes apply to future clock-ins.';
			await load();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not save the home.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Setup · Guad</title></svelte:head>

<section class="stack" aria-label="Agency setup">
	<h1>Setup</h1>
	{#if message}<p class="callout" role="status">{message}</p>{/if}

	{#if agency}
		<form class="card pad stack" onsubmit={saveAgency}>
			<h2>Agency</h2>
			<fieldset class="stack" disabled={saving}>
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
				<p class="muted">
					Admins always need two-step sign-in; supervisors after 30 days. Your plan:
					{agency.subscriptionTier}.
				</p>
				<div class="actions"><button class="btn">Save agency settings</button></div>
			</fieldset>
		</form>

		<div class="spread">
			<h2>Homes</h2>
			<button class="btn sec" disabled={saving} onclick={() => openHome()}>Add a home</button>
		</div>
		{#if editingHome !== null}
			<form class="card pad stack" onsubmit={saveHome}>
				<h3>{editingHome ? 'Edit home' : 'Add a home'}</h3>
				<fieldset class="stack" disabled={saving}>
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
						><b>{h.name}</b><span
							>{h.address ?? 'No address'} · clock-in radius {h.radius ?? 150} m</span
						></span
					>
					<button
						class="btn sec"
						disabled={saving}
						aria-label="Edit {h.name}"
						onclick={() => openHome(h)}>Edit</button
					>
				</div>
			{:else}
				<div class="row muted" role="listitem">No homes yet.</div>
			{/each}
		</div>
		<ControlledRulesSettings settings={agency.settings} onSaved={load} />
		<IncidentRulesSettings settings={agency.settings} onSaved={load} />
		<MaintenanceNotice timezone={agency.timezone ?? 'America/New_York'} />
	{/if}
</section>
