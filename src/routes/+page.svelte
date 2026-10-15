<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { signOutEverywhere } from '#lib/auth/firebase.ts';
	import { trpc } from '#lib/trpc.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Loaded through tRPC so this page exercises browser -> tRPC -> withUser -> RLS.
	// Browser only: the session cookie travels with the browser's request.
	const homes = browser ? trpc.home.list.query() : new Promise<never>(() => {});

	async function signOut() {
		await signOutEverywhere();
		await goto(resolve('/login'), { refreshAll: true });
	}
</script>

<svelte:head>
	<title>Guad</title>
</svelte:head>

<main>
	<h1>Guad</h1>
	<p>Signed in as {data.user.name} ({data.user.role}). Phase 1 build, synthetic data only.</p>
	<h2>Your homes</h2>
	{#await homes}
		<p>Loading…</p>
	{:then list}
		<ul>
			{#each list as home (home.id)}
				<li>{home.name}</li>
			{/each}
		</ul>
	{:catch}
		<p role="alert">Couldn't load homes.</p>
	{/await}
	<button onclick={signOut}>Sign out</button>
</main>
