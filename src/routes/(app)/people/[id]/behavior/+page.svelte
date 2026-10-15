<script lang="ts">
	import { page } from '$app/state';
	import NoteEditor from '#lib/app/NoteEditor.svelte';
</script>

<NoteEditor clientId={page.params.id} type="behavior" />
