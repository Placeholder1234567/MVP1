<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	let { form } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Forgot password · Guad</title>
</svelte:head>

<main class="unlock-page">
	<div class="card pad stack">
		<span class="wordmark">Guad<span class="lemon-dot">●</span></span>
		<h1>Forgot your password?</h1>
		{#if form?.sent}
			<p role="status">
				If that email has a Guad account, a link to set a new password is on its way. It expires in
				an hour. No email? Check spam, or ask your agency admin.
			</p>
		{:else}
			<p class="muted">Enter the email you sign in with and we’ll send you a link.</p>
			<form
				class="stack"
				method="POST"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update({ reset: false });
						busy = false;
					};
				}}
			>
				<label>
					Email
					<input
						class="input"
						type="email"
						name="email"
						autocomplete="username"
						maxlength="254"
						required
					/>
				</label>
				<button class="btn" type="submit" disabled={busy}
					>{busy ? 'Sending…' : 'Send reset link'}</button
				>
			</form>
			{#if form?.message}<p role="alert">{form.message}</p>{/if}
		{/if}
		<a class="textbtn" href={resolve('/login')}>Back to sign in</a>
	</div>
</main>
