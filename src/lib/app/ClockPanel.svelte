<script lang="ts">
	import { useSession } from './session.svelte';
	import { trpc } from '#lib/trpc.ts';
	const app = useSession();
	let busy = $state(false);
	let message = $state('');
	const active = $derived(
		app.clocks.find((c) => c.profile_id === app.user.profileId && !c.clock_out_at)
	);
	async function punch(location: boolean) {
		if (!app.db || busy) return;
		busy = true;
		message = '';
		try {
			if (active) {
				await app.db.execute(
					'UPDATE clock_records SET clock_out_at = ?, updated_at = ? WHERE id = ?',
					[new Date().toISOString(), new Date().toISOString(), active.id]
				);
				message = 'Clock-out saved on this device.';
			} else if (location) {
				if (!app.db.currentStatus.connected) {
					message =
						'You can clock in without location while offline. Your supervisor will review it.';
					return;
				}
				const position = await new Promise<GeolocationPosition>((resolve, reject) =>
					navigator.geolocation.getCurrentPosition(resolve, reject, {
						enableHighAccuracy: true,
						timeout: 15000,
						maximumAge: 0
					})
				);
				const row = await trpc.clock.clockIn.mutate({
					homeId: app.homeId,
					lat: position.coords.latitude,
					lng: position.coords.longitude,
					accuracy: position.coords.accuracy
				});
				message = row.verified
					? 'Clocked in. Location verified.'
					: 'Clocked in. Your supervisor will review the location.';
			} else {
				const now = new Date().toISOString();
				await app.db.execute(
					'INSERT INTO clock_records (id, agency_id, profile_id, home_id, clock_in_at, verified, manual_override, acknowledged, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)',
					[crypto.randomUUID(), app.user.agencyId, app.user.profileId, app.homeId, now, now, now]
				);
				message = 'Clock-in saved. Your supervisor will review the missing location.';
			}
		} catch {
			message =
				'Could not record this punch. If location is unavailable, choose clock-in without location.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="card pad stack">
	<div class="spread">
		<div>
			<b>{active ? 'You’re clocked in' : 'Ready for your shift?'}</b>
			<p class="muted">
				{active
					? `${app.homes.find((h) => h.id === active.home_id)?.name ?? 'Your home'} · ${active.verified ? 'Location verified' : 'Location needs review'}`
					: 'Choose how to record your arrival.'}
			</p>
		</div>
		{#if active}<span class="pill"
				>Since {new Date(active.clock_in_at!).toLocaleTimeString([], {
					hour: 'numeric',
					minute: '2-digit'
				})}</span
			>{/if}
	</div>
	<div class="actions">
		{#if active}<button class="btn sec" disabled={busy} onclick={() => punch(false)}
				>Clock out</button
			>{:else}<button class="btn" disabled={busy || !app.homeId} onclick={() => punch(true)}
				>{busy ? 'Recording…' : 'Clock in with location'}</button
			><button class="textbtn" disabled={busy || !app.homeId} onclick={() => punch(false)}
				>Clock in without location</button
			>{/if}
	</div>
	{#if message}<p role="status">{message}</p>{/if}
</section>
