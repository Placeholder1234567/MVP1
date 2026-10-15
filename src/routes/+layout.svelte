<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '#lib/app/styles.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/guad-192.png" />
	<meta name="theme-color" content="#2F3ED8" />
</svelte:head>

{@render children()}
