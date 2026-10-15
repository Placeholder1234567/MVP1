<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signOutEverywhere } from '#lib/auth/firebase.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	async function signOut() {
		await signOutEverywhere();
		await goto(resolve('/login'), { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Guad</title>
</svelte:head>

<main>
	<h1>Guad</h1>
	<p>Signed in as {data.user.name} ({data.user.role}). Phase 1 build, synthetic data only.</p>
	<button onclick={signOut}>Sign out</button>
</main>
