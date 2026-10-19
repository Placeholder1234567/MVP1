<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { PASSWORD_MIN } from '#lib/domain/password.ts';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head>
	<title>Set your password · Guad</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="unlock-page">
	<div class="card pad stack">
		<span class="wordmark">Guad<span class="lemon-dot">●</span></span>
		{#if form?.done}
			<h1>Password saved</h1>
			<p class="muted">You’ve been signed out on other devices. Sign in with your new password.</p>
			<a class="btn" href={resolve('/login')}>Go to sign in</a>
		{:else if data.problem}
			<h1>Set your password</h1>
			<p role="alert">{data.problem}</p>
			<a class="btn sec" href={resolve('/forgot-password')}>Get a new link</a>
		{:else}
			<h1>Set your password</h1>
			<p class="muted">
				For <b>{data.email}</b>. Use at least {PASSWORD_MIN} characters; a few words with spaces work
				well. We check it isn’t a password that has leaked in a data breach.
			</p>
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
				<input type="text" name="username" autocomplete="username" value={data.email} hidden />
				<label>
					New password
					<input
						class="input"
						type="password"
						name="password"
						autocomplete="new-password"
						minlength={PASSWORD_MIN}
						maxlength="128"
						required
					/>
				</label>
				<label>
					Type it again
					<input
						class="input"
						type="password"
						name="confirm"
						autocomplete="new-password"
						minlength={PASSWORD_MIN}
						maxlength="128"
						required
					/>
				</label>
				<button class="btn" type="submit" disabled={busy}
					>{busy ? 'Saving…' : 'Save password'}</button
				>
			</form>
			{#if form?.message}<p role="alert">{form.message}</p>{/if}
		{/if}
	</div>
</main>
