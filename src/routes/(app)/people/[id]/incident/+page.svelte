<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ClinicalWorkspace from '#lib/app/ClinicalWorkspace.svelte';
</script>

<svelte:head><title>Incident · Guad</title></svelte:head>
<a class="textbtn" href={resolve('/(app)/people/[id]', { id: page.params.id! })}>← Back</a>
<ClinicalWorkspace clientId={page.params.id!} section="incident" />
