<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { pushNotificationId } from '#lib/domain/push.ts';
	let id = $state('');
	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		const receive = (event: MessageEvent) => {
			if (event.source !== navigator.serviceWorker.controller || event.data?.type !== 'guad-push')
				return;
			id = pushNotificationId({ data: event.data }) ?? '';
		};
		navigator.serviceWorker.addEventListener('message', receive);
		return () => navigator.serviceWorker.removeEventListener('message', receive);
	});
</script>

{#if id}<div class="callout spread" role="status">
		<p>New Guad update. Open your alerts to review it.</p>
		<a class="btn sec" href={resolve('/(app)/notifications/[id]', { id })}>Review alert</a><button
			class="textbtn"
			onclick={() => (id = '')}>Dismiss update</button
		>
	</div>{/if}
