<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signIn } from '#lib/auth/firebase.ts';

	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let message = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			await signIn(email.trim(), password);
			await goto(resolve('/'), { refreshAll: true });
		} catch (e) {
			// Firebase error codes, not user data; safe to show.
			const code = (e as { code?: string }).code ?? '';
			message =
				code === 'auth/invalid-credential' || code === 'auth/wrong-password'
					? "That email and password don't match."
					: code === 'auth/too-many-requests'
						? 'Too many attempts. Wait a few minutes and try again.'
						: e instanceof Error
							? e.message
							: 'Sign-in failed.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in · Guad</title>
</svelte:head>

<main>
	<h1>Sign in to Guad</h1>
	<form onsubmit={submit}>
		<label>
			Email
			<input type="email" autocomplete="username" required bind:value={email} />
		</label>
		<label>
			Password
			<input type="password" autocomplete="current-password" required bind:value={password} />
		</label>
		<button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
		{#if message}<p role="alert">{message}</p>{/if}
	</form>
</main>
