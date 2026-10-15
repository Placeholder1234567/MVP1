<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	type Room = Awaited<ReturnType<typeof trpc.intake.listRooms.query>>[number];
	let {
		rooms,
		loading,
		loaded,
		refresh
	}: { rooms: Room[]; loading: boolean; loaded: boolean; refresh: () => Promise<void> } = $props();
	const app = useSession();
	let editing = $state<string | null>(null);
	let homeId = $state('');
	let name = $state('');
	let capacity = $state(1);
	let availability = $state<'available' | 'reserved'>('available');
	let occupant = $state('');
	let dirty = $state(false);
	let saving = $state(false);
	let message = $state('');
	const current = $derived(rooms.find((r) => r.id === editing));
	const people = $derived(
		app.people.filter(
			(p) =>
				p.active &&
				p.home_id === homeId &&
				!rooms.some((r) => r.id !== editing && r.occupiedBy === p.id)
		)
	);
	beforeNavigate(({ cancel }) => {
		if (dirty && !confirm('Leave without saving your room changes?')) cancel();
	});
	function open(room?: Room) {
		if (dirty && !confirm('Discard your unsaved room changes?')) return;
		editing = room?.id ?? '';
		homeId = room?.homeId ?? app.homes[0]?.id ?? '';
		name = room?.name ?? '';
		capacity = room?.capacity ?? 1;
		availability = room?.status === 'reserved' ? 'reserved' : 'available';
		occupant = room?.occupiedBy ?? '';
		dirty = false;
		message = '';
	}
	function cancel() {
		if (!dirty || confirm('Discard your unsaved room changes?')) {
			editing = null;
			dirty = false;
		}
	}
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!homeId || saving || loading) return;
		if (
			current?.occupiedBy &&
			current.occupiedBy !== occupant &&
			!confirm('Release this room? The client record stays active in the home.')
		)
			return;
		if (
			!current?.occupiedBy &&
			occupant &&
			!confirm('Assign this client to the room? Confirm the placement has been reviewed.')
		)
			return;
		saving = true;
		message = '';
		try {
			if (editing)
				await trpc.intake.updateRoom.mutate({
					id: editing,
					name,
					capacity,
					occupiedBy: occupant || null,
					status: occupant ? 'occupied' : availability
				});
			else await trpc.intake.createRoom.mutate({ homeId, name, capacity, status: availability });
			dirty = false;
			editing = null;
			await refresh();
			message = 'Room saved. Availability is checked again during admission.';
		} catch {
			message =
				'Could not save. Connect and refresh availability, use a unique room name, and check the client is still active in this home. Your form is kept here.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>
<section class="stack" aria-label="Room management">
	<div class="spread">
		<h2>Rooms across homes</h2>
		<button class="btn sec" disabled={saving || loading} onclick={() => open()}>Add room</button>
	</div>
	<p class="muted">
		Configure room names and physical capacity. Each room record currently supports one assigned
		client, regardless of capacity; availability counts rooms, not beds. A reservation holds the
		whole room and is not linked to a referral. Room changes need a connection.
	</p>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if editing !== null}
		<form
			class="card pad stack"
			onsubmit={save}
			oninput={() => (dirty = true)}
			onchange={() => (dirty = true)}
		>
			<h3>{editing ? 'Edit room' : 'Add a room'}</h3>
			<fieldset disabled={saving || loading} class="stack">
				<label
					>Room home<select class="input" required disabled={!!editing} bind:value={homeId}
						><option value="">Choose a home</option>{#each app.homes as home (home.id)}<option
								value={home.id}>{home.name}</option
							>{/each}</select
					></label
				>
				<label>Room name<input class="input" required maxlength="100" bind:value={name} /></label>
				<label
					>Physical capacity<input
						class="input"
						required
						type="number"
						min="1"
						max="20"
						step="1"
						bind:value={capacity}
					/></label
				>
				<p class="muted">
					Capacity is informational. Shared occupancy requires a separate bed allocation model.
				</p>
				{#if editing}
					<label
						>Assigned client<select
							class="input"
							bind:value={occupant}
							disabled={!!current?.occupiedBy}
							><option value="">No client assigned</option
							>{#if current?.occupiedBy && !people.some((p) => p.id === current.occupiedBy)}<option
									value={current.occupiedBy}
									>{current.occupiedByName || 'Current assigned client'}</option
								>{/if}{#each people as person (person.id)}<option value={person.id}
									>{person.name}</option
								>{/each}</select
						></label
					>
					{#if current?.occupiedBy && occupant}<button
							type="button"
							class="btn sec"
							onclick={() => {
								occupant = '';
								dirty = true;
							}}>Release assignment on save</button
						>{/if}
					<p class="muted">
						Only active clients in this home without another room appear. Release and save before
						assigning a different client. Releasing a room does not discharge the client.
					</p>
				{/if}
				{#if !occupant}<label
						>Availability<select class="input" bind:value={availability}
							><option value="available">Available</option><option value="reserved">Reserved</option
							></select
						></label
					>{:else}<p class="pill">Occupied</p>{/if}
				<div class="actions">
					<button class="btn" disabled={!name.trim() || !homeId}>Save room</button><button
						type="button"
						class="btn sec"
						onclick={cancel}>Cancel room changes</button
					>
				</div>
			</fieldset>
		</form>
	{/if}
	<div class="grid">
		{#each rooms as room (room.id)}
			<article class="card pad stack">
				<div class="spread">
					<h3>{room.name}</h3>
					<span class="pill" class:ok={room.status === 'available' && !room.occupiedBy}
						>{room.status}</span
					>
				</div>
				<p>{room.homeName}</p>
				<p class="muted">
					Physical capacity: {room.capacity} · {room.occupiedBy
						? '1 assigned client'
						: 'No assigned client'}
				</p>
				{#if room.occupiedByName}<p>{room.occupiedByName}</p>{/if}<button
					class="btn sec"
					disabled={saving || loading}
					onclick={() => open(room)}>Manage {room.name}</button
				>
			</article>
		{:else}<p class="card empty">
				{loaded
					? 'No rooms configured. Add a room to start tracking availability.'
					: 'Connect and refresh to load room inventory.'}
			</p>{/each}
	</div>
</section>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
</style>
