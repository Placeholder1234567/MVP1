<script lang="ts">
	import { onMount } from 'svelte';
	import RoomInventory from '#lib/components/intake/RoomInventory.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	const app = useSession();
	const stages = ['inquiry', 'touring', 'accepted', 'waitlist', 'declined', 'placed'] as const;
	type Stage = (typeof stages)[number];
	type Referral = Awaited<ReturnType<typeof trpc.intake.getReferral.query>>;
	let referrals = $state<Awaited<ReturnType<typeof trpc.intake.listReferrals.query>>>([]);
	let rooms = $state<Awaited<ReturnType<typeof trpc.intake.listRooms.query>>>([]);
	let selected = $state<Referral | null>(null);
	let filter = $state<Stage | ''>('');
	let offset = $state(0);
	let busy = $state(false);
	let loaded = $state(false);
	let message = $state('');
	let creating = $state(false);
	let dirty = $state(false);
	let clientName = $state('');
	let source = $state('');
	let contactName = $state('');
	let phone = $state('');
	let email = $state('');
	let notes = $state('');
	let stage = $state<Stage>('inquiry');
	let homeId = $state('');
	let admissionName = $state('');
	let firstName = $state('');
	let roomId = $state('');
	const available = $derived(
		rooms.filter((r) => r.homeId === homeId && r.status === 'available' && !r.occupiedBy)
	);
	const occupied = $derived(rooms.filter((r) => r.occupiedBy).length);
	beforeNavigate(({ cancel }) => {
		if (dirty && !confirm('Leave without saving your referral changes?')) cancel();
	});
	function leaveForm() {
		return !dirty || confirm('Discard your unsaved referral changes?');
	}
	async function load() {
		busy = true;
		try {
			const [rows, inventory] = await Promise.all([
				trpc.intake.listReferrals.query({ status: filter || undefined, limit: 50, offset }),
				trpc.intake.listRooms.query({})
			]);
			referrals = rows;
			rooms = inventory;
			loaded = true;
		} catch {
			message =
				'Connect to load intake and room availability. Your open form stays here while you reconnect.';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void load();
	});
	async function open(id: string) {
		if (!leaveForm()) return;
		busy = true;
		message = '';
		try {
			const row = await trpc.intake.getReferral.query({ id });
			selected = row;
			creating = false;
			clientName = row.client_name ?? '';
			source = row.source ?? '';
			contactName = row.contact_name ?? '';
			phone = row.contact_phone ?? '';
			email = row.contact_email ?? '';
			notes = row.notes ?? '';
			stage = row.status;
			homeId = row.assigned_home_id ?? '';
			admissionName = row.client_name ?? '';
			firstName = '';
			roomId = '';
			dirty = false;
		} catch {
			message = 'Could not open this referral. Connect and refresh the list.';
		} finally {
			busy = false;
		}
	}
	function newReferral() {
		if (!leaveForm()) return;
		selected = null;
		creating = true;
		clientName = '';
		source = '';
		contactName = '';
		phone = '';
		email = '';
		notes = '';
		stage = 'inquiry';
		homeId = '';
		dirty = false;
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const details = { contactName, contactPhone: phone, contactEmail: email, notes };
			if (creating) {
				const row = await trpc.intake.createReferral.mutate({ ...details, clientName, source });
				dirty = false;
				await open(row.id);
			} else if (selected) {
				selected = await trpc.intake.updateReferral.mutate({
					...details,
					id: selected.id,
					status: stage,
					assignedHomeId: homeId || undefined
				});
				dirty = false;
			}
			await load();
			message = 'Referral saved.';
		} catch {
			message = 'Could not save. Connect and check the form. Placed referrals cannot be changed.';
		} finally {
			busy = false;
		}
	}
	async function admit(event: SubmitEvent) {
		event.preventDefault();
		if (!selected || dirty) return;
		if (!confirm('Create this client record and complete the admission?')) return;
		busy = true;
		message = '';
		try {
			await trpc.intake.convertToClient.mutate({
				referralId: selected.id,
				homeId,
				name: admissionName,
				firstName: firstName || undefined,
				roomId: roomId || undefined
			});
			await open(selected.id);
			await load();
			message = 'Admission complete. The new client will appear in Care records when synced.';
		} catch {
			message =
				'Admission could not be completed. Refresh availability and check that this referral is still accepted.';
			await load();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Intake · Guad</title></svelte:head>
<svelte:window
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>
<div class="stack">
	<div class="spread">
		<div>
			<p class="eyebrow">Client intake</p>
			<h1>A thoughtful welcome.</h1>
		</div>
		<button class="btn" disabled={busy} onclick={newReferral}>New referral</button>
	</div>
	<p class="muted">
		Follow each inquiry, find an available room, and welcome a new client into care. Intake updates
		need a connection.
	</p>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	<div class="stats">
		<div class="card pad">
			<p class="muted">Available rooms</p>
			<p class="stat-number">
				{loaded ? rooms.filter((r) => r.status === 'available' && !r.occupiedBy).length : '—'}
			</p>
		</div>
		<div class="card pad">
			<p class="muted">Reserved rooms</p>
			<p class="stat-number">
				{loaded ? rooms.filter((r) => r.status === 'reserved').length : '—'}
			</p>
		</div>
		<div class="card pad">
			<p class="muted">Occupied rooms</p>
			<p class="stat-number">{loaded ? occupied : '—'}</p>
		</div>
	</div>
	<div class="review-layout" class:picked={creating || !!selected}>
		<section class="stack pipeline" aria-label="Referral pipeline">
			<div class="spread">
				<h2>Referrals</h2>
				<button
					class="textbtn"
					disabled={busy}
					onclick={() => {
						message = '';
						void load();
					}}>Refresh</button
				>
			</div>
			<label
				>Filter by stage<select
					class="input"
					disabled={busy}
					bind:value={filter}
					onchange={() => {
						offset = 0;
						void load();
					}}
					><option value="">All stages</option>{#each stages as value (value)}<option {value}
							>{value}</option
						>{/each}</select
				></label
			>
			{#each referrals as row (row.id)}<button
					class="card pad record-choice"
					disabled={busy}
					aria-pressed={selected?.id === row.id}
					onclick={() => open(row.id)}
					><span
						><b>{row.clientName || row.contactName || 'New inquiry'}</b><small
							>{row.source || 'Source not recorded'} · {row.assignedHomeName ||
								'Home to be decided'}</small
						></span
					><span class="pill" class:ok={row.status === 'placed'}>{row.status}</span></button
				>{:else}<p class="card empty">
					{loaded
						? 'No referrals in this view. Start with a new inquiry.'
						: 'Connect and refresh to load referrals.'}
				</p>{/each}
			<div class="actions">
				<button
					class="btn sec"
					disabled={busy || offset === 0}
					onclick={() => {
						offset -= 50;
						void load();
					}}>Previous</button
				><span class="muted">Page {offset / 50 + 1}</span><button
					class="btn sec"
					disabled={busy || referrals.length < 50}
					onclick={() => {
						offset += 50;
						void load();
					}}>Next</button
				>
			</div>
		</section>
		<section class="stack details" aria-label="Referral details">
			{#if creating || selected}
				<!-- Narrow screens show the list or the referral, not both (frontend-audit finding 20). -->
				<button
					type="button"
					class="textbtn back"
					onclick={() => {
						if (!leaveForm()) return;
						selected = null;
						creating = false;
						dirty = false;
					}}>← All referrals</button
				>
				<form
					class="card pad stack"
					onsubmit={save}
					oninput={() => (dirty = true)}
					onchange={() => (dirty = true)}
				>
					<h2>{creating ? 'Start an inquiry' : clientName || 'Referral details'}</h2>
					{#if selected?.status === 'placed'}<p class="callout">
							Admission complete. This referral is read-only.
						</p>{/if}
					<fieldset class="stack" disabled={busy || selected?.status === 'placed'}>
						{#if creating}<label
								>Client name<input class="input" maxlength="200" bind:value={clientName} /></label
							><label
								>Referral source<input
									class="input"
									maxlength="200"
									bind:value={source}
									placeholder="Family, case manager, state agency…"
								/></label
							>{:else}<p class="muted">Source: {source || 'Not recorded'}</p>{/if}
						<label
							>Contact name<input class="input" maxlength="200" bind:value={contactName} /></label
						>
						<div class="grid">
							<label
								>Contact phone<input
									class="input"
									type="tel"
									maxlength="50"
									bind:value={phone}
								/></label
							><label
								>Contact email<input
									class="input"
									type="email"
									maxlength="254"
									bind:value={email}
								/></label
							>
						</div>
						{#if !creating}<label
								>Stage<select class="input" bind:value={stage}
									>{#each stages.filter((s) => s !== 'placed' || selected?.status === 'placed') as value (value)}<option
											{value}>{value}</option
										>{/each}</select
								></label
							><label
								>Proposed home<select
									class="input"
									bind:value={homeId}
									onchange={() => (roomId = '')}
									><option value="">Choose later</option>{#each app.homes as home (home.id)}<option
											value={home.id}>{home.name}</option
										>{/each}</select
								></label
							>{/if}
						<label
							>Intake notes<textarea class="input" rows="5" maxlength="8000" bind:value={notes}
							></textarea></label
						>
						{#if selected?.status !== 'placed'}<button class="btn"
								>{creating ? 'Create referral' : 'Save referral'}</button
							>{/if}
					</fieldset>
				</form>
				{#if selected?.status === 'accepted' && !creating}<form
						class="card pad stack"
						onsubmit={admit}
					>
						<h2>Welcome into care</h2>
						<p class="muted">
							Creates the client and a blank health record. Confirm the home and name before
							admitting.
						</p>
						{#if dirty}<p class="callout">Save your referral changes before admission.</p>{/if}
						<div class="stack" role="group" aria-label="Placement availability guidance">
							<h3>Compare homes</h3>
							<p class="muted">
								Availability guidance only. Review needs, accessibility, caregiver skills and
								staffing before choosing a home. Referral notes are not used to infer clinical
								eligibility.
							</p>
							{#each app.homes as home (home.id)}
								{@const inventory = rooms.filter((r) => r.homeId === home.id)}
								{@const openRooms = inventory.filter(
									(r) => r.status === 'available' && !r.occupiedBy
								)}
								<div class="card pad stack">
									<h4>
										{home.name}{selected.assigned_home_id === home.id ? ' · Proposed home' : ''}
									</h4>
									<p>
										{openRooms.length} available {openRooms.length === 1 ? 'room' : 'rooms'} · {inventory.filter(
											(r) => r.status === 'reserved'
										).length} reserved
									</p>
									{#if openRooms.length}<p class="muted">
											{openRooms.map((r) => r.name).join(', ')}
										</p>{:else}<p class="muted">
											{inventory.length
												? 'No available rooms recorded.'
												: 'Room inventory is not configured.'} Confirm placement arrangements before admitting
											without a room.
										</p>{/if}
									<button
										type="button"
										class="btn sec"
										disabled={busy || dirty}
										aria-pressed={homeId === home.id}
										onclick={() => {
											homeId = home.id;
											roomId = '';
										}}>Choose {home.name}</button
									>
								</div>
							{/each}
						</div>
						<label
							>Client’s full name<input
								class="input"
								required
								maxlength="200"
								bind:value={admissionName}
							/></label
						><label>First name<input class="input" maxlength="100" bind:value={firstName} /></label>
						<label
							>Admission home<select
								class="input"
								required
								bind:value={homeId}
								onchange={() => (roomId = '')}
								><option value="">Choose a home</option>{#each app.homes as home (home.id)}<option
										value={home.id}>{home.name}</option
									>{/each}</select
							></label
						>
						<label
							>Available room<select class="input" bind:value={roomId}
								><option value="">Assign a room later</option
								>{#each available as room (room.id)}<option value={room.id}>{room.name}</option
									>{/each}</select
							></label
						>
						<button class="btn" disabled={busy || dirty || !homeId}>Complete admission</button>
					</form>{/if}
			{:else}<div class="card empty">Choose a referral to review, or start a new inquiry.</div>{/if}
		</section>
	</div>
	<RoomInventory {rooms} loading={busy} {loaded} refresh={load} />
</div>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	small {
		display: block;
		color: var(--muted);
	}
	.record-choice {
		text-align: left;
	}
	.back {
		display: none;
		align-self: flex-start;
	}
	@media (max-width: 900px) {
		.picked .pipeline,
		.review-layout:not(.picked) .details {
			display: none;
		}
		.back {
			display: inline-flex;
		}
	}
</style>
