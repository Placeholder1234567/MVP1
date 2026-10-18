<script lang="ts">
	// Learn-by-doing first steps for caregivers on Today (frontend-spec-2.md
	// §6.5): each step ticks itself off from the records, and the card goes
	// once all are done or the person hides it. Rules: domain/onboarding.ts.
	import { resolve } from '$app/paths';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { onboardingSteps, parseDisclosure, showOnboarding } from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';

	const app = useSession();
	let hidden = $state(false);
	let message = $state('');
	const mine = $derived(app.notes.filter((n) => n.author_id === app.user.profileId));
	const steps = $derived(
		onboardingSteps({
			clockedIn: app.clocks.some((c) => c.profile_id === app.user.profileId),
			wroteNote: mine.length > 0,
			signedNote: mine.some((n) => n.status === 'submitted' || n.status === 'approved')
		})
	);
	const visible = $derived(
		!hidden && showOnboarding(app.user.role, parseDisclosure(app.settings?.disclosure), steps)
	);
	const first = $derived(app.currentPeople[0]);
	const next = $derived(steps.find((s) => !s.done));

	async function hide() {
		hidden = true;
		try {
			await trpc.auth.setDisclosure.mutate({ onboardingDone: true });
		} catch {
			// Hidden on this screen for now; it is saved once the device is online.
			message = 'Hidden for now. Reconnect to keep these tips hidden on your other devices.';
		}
	}
</script>

{#if visible}
	<section class="card pad stack getting-started" aria-labelledby="getting-started-title">
		<div class="spread">
			<div class="intro">
				<span class="orb" aria-hidden="true">◒</span>
				<div>
					<h2 id="getting-started-title">Getting started</h2>
					<p class="muted">
						Four small steps, about three minutes. Lomi will be here if you need help.
					</p>
				</div>
			</div>
		</div>
		<ol class="steps">
			{#each steps as step (step.key)}
				<li class:done={step.done} aria-current={next?.key === step.key ? 'step' : undefined}>
					<span class="mark" aria-hidden="true">{step.done ? '✓' : ''}</span>
					<span
						>{#if step.key === 'person' && !step.done && first}<a
								href={resolve('/(app)/people/[id]', { id: first.id })}>{step.label}</a
							>{:else}{step.label}{/if}<span class="sr">{step.done ? ' (done)' : ''}</span></span
					>
				</li>
			{/each}
		</ol>
		{#if next?.key === 'clock'}<p class="muted">
				Use “Clock in” just below to record your arrival.
			</p>
		{:else if next?.key === 'sign'}<p class="muted">
				Open your note, tick “I reviewed this note”, then choose Sign and submit.
			</p>{/if}
		<button class="textbtn" onclick={hide}>Hide these tips</button>
	</section>
{:else if message}<p class="muted" role="status">{message}</p>{/if}

<style>
	.getting-started {
		background: var(--lemon-2);
		border: 1px solid var(--lemon-line);
	}
	.intro {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.intro h2,
	.intro p {
		margin: 0;
	}
	.orb {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--lemon);
		color: #1c1b4b;
		font-size: 26px;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 32px;
	}
	.steps li.done {
		color: var(--muted);
		text-decoration: line-through;
	}
	.mark {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 24px;
		height: 24px;
		border-radius: 999px;
		border: 2px solid var(--line2);
		background: var(--card);
		font-size: 14px;
		color: var(--ok);
	}
	li.done .mark {
		border-color: var(--ok);
		background: var(--ok-bg);
	}
	li[aria-current='step'] {
		font-weight: 600;
	}
	.textbtn {
		align-self: flex-start;
	}
</style>
