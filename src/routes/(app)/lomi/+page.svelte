<script lang="ts">
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	const app = useSession();
</script>

<svelte:head><title>Talk to Lomi · Guad</title></svelte:head>
<section class="stack" aria-label="Start charting with Lomi">
	<p class="eyebrow">A little help from Lomi</p>
	<h1>Who are you charting for?</h1>
	<p class="muted">
		Choose someone in your current home, then speak or type what you observed. Review Lomi’s draft,
		make corrections and sign when you’re ready.
	</p>
	<p class="muted">
		Voice requires connected transcription. When AI is unavailable, you can keep writing and review
		the local fallback.
	</p>
	{#if !app.privacyLocked}
		{#each app.currentPeople as person (person.id)}
			<a
				class="card pad row"
				href={resolve('/(app)/people/[id]/note', { id: person.id })}
			>
				<span class="grow"><b>{person.name}</b><span>Start a shift note with Lomi</span></span>
			</a>
		{:else}
			<p class="callout">
				No people are available in this home yet. Choose a home with care records to start charting.
			</p>
		{/each}
	{/if}
	<p class="muted">Lomi never submits a note for you. You can also write directly in the note.</p>
</section>
