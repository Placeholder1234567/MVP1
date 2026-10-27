<script lang="ts">
	import { useSession } from '#lib/app/session.svelte.ts';
	import { resolve } from '$app/paths';
	import InstallCard from '#lib/app/InstallCard.svelte';
	import HelpCard from '#lib/app/HelpCard.svelte';
	import MyHours from '#lib/app/MyHours.svelte';
	import StaffCredentials from '#lib/app/StaffCredentials.svelte';

	const app = useSession();
	let error = $state('');
	async function signOut() {
		try {
			await app.signOut();
		} catch {
			error = 'Could not sign out. Please try again.';
		}
	}
</script>

<svelte:head><title>Me · Guad</title></svelte:head>
<div class="stack">
	<p class="eyebrow">Your workspace</p>
	<h1>{app.user.name}</h1>
	<div class="actions">
		<a class="btn sec" href={resolve('/(app)/notifications')}
			>Your alerts ({app.unreadAlerts} unread)</a
		><a class="btn sec" href={resolve('/(app)/me/notifications')}>Delivery preferences</a>
	</div>
	<div class="card pad stack">
		<p><b>Role</b><br />{app.user.role}</p>
		<p>
			<b>Homes</b><br />{app.homes
				.filter((h) => app.user.homeIds.includes(h.id))
				.map((h) => h.name)
				.join(', ') || 'Agency-wide access'}
		</p>
		<p><b>Medication certified</b><br />{app.user.medCertified ? 'Yes' : 'No'}</p>
		<p><b>Time zone</b><br />{app.user.timeZone}</p>
	</div>
	{#if app.has('timekeeping')}<MyHours />{/if}
	<StaffCredentials profileId={app.user.profileId} title="My training and certifications" />
	<button class="btn sec" onclick={() => app.lock()}>Lock device</button><button
		class="btn sec"
		onclick={signOut}>Sign out on all devices</button
	>{#if error}<p role="alert">
			{error}
		</p>{/if}
	<HelpCard />
	<InstallCard />
</div>
