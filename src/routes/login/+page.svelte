<script lang="ts">
	let { data } = $props();
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		completeMfaSignIn,
		finishTotpEnrollment,
		MfaChallenge,
		MfaEnrollmentNeeded,
		signIn,
		startTotpEnrollment
	} from '#lib/auth/firebase.ts';
	import type { MultiFactorResolver, TotpSecret } from 'firebase/auth';

	// password -> (code, if the account has two-step sign-in)
	//          -> (enroll, if the role needs it and none is set up)
	let step = $state<'password' | 'code' | 'enroll' | 'enrolled'>('password');
	let email = $state('');
	let password = $state('');
	let code = $state('');
	let busy = $state(false);
	let message = $state('');
	let resolver: MultiFactorResolver | undefined;
	let enrollment = $state<{ secret: TotpSecret; key: string; otpauthUrl: string }>();
	// QR code for the authenticator app, drawn in the browser (the secret never
	// leaves this page). The library loads only when enrollment starts.
	let qr = $state('');
	$effect(() => {
		const url = enrollment?.otpauthUrl;
		qr = '';
		if (!url) return;
		void import('qrcode').then((QR) =>
			QR.toDataURL(url, { margin: 1, width: 220 }).then((data) => {
				if (enrollment?.otpauthUrl === url) qr = data;
			})
		);
	});

	function explain(e: unknown): string {
		// Firebase error codes, not user data; safe to show.
		const c = (e as { code?: string }).code ?? '';
		if (c === 'auth/invalid-credential' || c === 'auth/wrong-password')
			return "That email and password don't match.";
		if (c === 'auth/invalid-verification-code' || c === 'auth/invalid-totp-code')
			return "That code didn't work. Check the time on your phone and try the newest code.";
		if (c === 'auth/too-many-requests')
			return 'Too many attempts. Wait a few minutes and try again.';
		if (c === 'auth/requires-recent-login') return 'Sign in again to continue.';
		return e instanceof Error ? e.message : 'Sign-in failed.';
	}

	// The session result also says how long a supervisor's MFA grace period
	// has left (mfaGraceDaysLeft); a reminder for it belongs on the dashboard.
	async function done() {
		await goto(resolve('/'), { refreshAll: true });
	}

	async function run(action: () => Promise<void>) {
		busy = true;
		message = '';
		try {
			await action();
		} catch (e) {
			if (e instanceof MfaChallenge) {
				resolver = e.resolver;
				step = 'code';
				code = '';
				message = e.message;
			} else if (e instanceof MfaEnrollmentNeeded) {
				enrollment = await startTotpEnrollment().catch((err) => {
					message = explain(err);
					return undefined;
				});
				if (enrollment) {
					step = 'enroll';
					code = '';
					message = e.message;
				}
			} else {
				message = explain(e);
			}
		} finally {
			busy = false;
		}
	}

	const submitPassword = (event: SubmitEvent) => {
		event.preventDefault();
		return run(async () => {
			await signIn(email.trim(), password);
			await done();
		});
	};
	const submitCode = (event: SubmitEvent) => {
		event.preventDefault();
		return run(async () => {
			await completeMfaSignIn(resolver!, code.trim());
			await done();
		});
	};
	const submitEnrollment = (event: SubmitEvent) => {
		event.preventDefault();
		return run(async () => {
			await finishTotpEnrollment(enrollment!.secret, code.trim());
			enrollment = undefined;
			password = '';
			step = 'enrolled';
			message = 'Two-step sign-in is set up. Sign in again and enter the code from your app.';
		});
	};
</script>

<svelte:head>
	<title>Sign in · Guad</title>
</svelte:head>

<main class="unlock-page">
	<div class="card pad stack">
		<span class="wordmark">Guad<span class="lemon-dot">●</span></span>
		{#if step === 'code'}
			<h1>Two-step sign-in</h1>
			<form class="stack" onsubmit={submitCode}>
				<label>
					6-digit code from your authenticator app
					<input
						class="input"
						inputmode="numeric"
						autocomplete="one-time-code"
						pattern="[0-9]{6}"
						maxlength="6"
						required
						bind:value={code}
					/>
				</label>
				<button class="btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
			</form>
		{:else if step === 'enroll' && enrollment}
			<h1>Set up two-step sign-in</h1>
			<p class="muted">
				Add Guad to an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password
				or similar): scan this code with the app. On this phone, <!-- otpauth: hands off to the authenticator app; not an in-app route -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={enrollment.otpauthUrl}>open it in your app</a>, or enter this key by hand:
			</p>
			{#if qr}<img
					src={qr}
					width="220"
					height="220"
					alt="QR code to add Guad to an authenticator app"
				/>{/if}
			<p><code>{enrollment.key}</code></p>
			<form class="stack" onsubmit={submitEnrollment}>
				<label>
					Code shown in the app
					<input
						class="input"
						inputmode="numeric"
						autocomplete="one-time-code"
						pattern="[0-9]{6}"
						maxlength="6"
						required
						bind:value={code}
					/>
				</label>
				<button class="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Turn on'}</button>
			</form>
		{:else}
			<h1>A good day starts with care.</h1>
			<p class="muted">Sign in to your workspace.</p>
			<form class="stack" onsubmit={submitPassword}>
				<label>
					Email
					<input class="input" type="email" autocomplete="username" required bind:value={email} />
				</label>
				<label>
					Password
					<input
						class="input"
						type="password"
						autocomplete="current-password"
						required
						bind:value={password}
					/>
				</label>
				<button class="btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button
				>
			</form>
			{#if data.demo}
				<section class="callout stack" aria-label="Local demo accounts">
					<b>Local demo accounts</b>
					<span class="muted"
						>Synthetic accounts in the local sign-in emulator. If sign-in fails, run
						<code>npm run db:seed</code> (the emulator forgets accounts when it restarts). Password
						for all: <code>{data.demo.password}</code></span
					>
					<div class="actions">
						{#each data.demo.accounts as account (account.email)}
							<button
								type="button"
								class="btn sec"
								onclick={() => {
									email = account.email;
									password = data.demo!.password;
								}}>{account.name} · {account.role}</button
							>
						{/each}
					</div>
				</section>
			{/if}
		{/if}
		{#if message}<p role="alert">{message}</p>{/if}
	</div>
</main>
