<script lang="ts">
	import { page } from '$app/state';
	import NotificationInbox from '#lib/app/components/NotificationInbox.svelte';
</script>

<NotificationInbox focusId={page.params.id} />
