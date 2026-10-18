<script lang="ts">
	// In-app help on Me (frontend-audit.md finding 11): short answers to the
	// questions new staff ask, and the Therap terms next to Guad's, so people
	// moving from Therap can find their way (charting-guide.md).
	import { useSession } from '#lib/app/session.svelte.ts';
	import { chartingLabels } from '#lib/config/charting-preset.ts';
	import { parseDisclosure } from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';

	const app = useSession();
	const ours = chartingLabels('default');
	const therap = chartingLabels('therap');
	const terms: [string, string][] = [
		[ours.shift, therap.shift],
		[ours.behavior, therap.behavior],
		[ours.goals, therap.goals],
		[ours.medications, therap.medications],
		[ours.incident, therap.incident],
		['Team messages', 'SComm']
	];
	let message = $state('');
	const tipsHidden = $derived(!!parseDisclosure(app.settings?.disclosure).onboardingDone);

	async function showTips() {
		try {
			await trpc.auth.setDisclosure.mutate({ onboardingDone: false });
			message = 'Getting-started tips are back on Today.';
		} catch {
			message = 'Reconnect to bring the tips back.';
		}
	}
</script>

<section class="card pad stack" aria-labelledby="help-title">
	<h2 id="help-title">Help</h2>
	<details>
		<summary>What if I lose signal?</summary>
		<p>
			Keep working. Notes, medications and health entries save on this device and sync when you
			reconnect. The app bar says when changes are waiting. Approving notes and accepting extra
			shifts need a connection.
		</p>
	</details>
	<details>
		<summary>How do I write and sign a note?</summary>
		<p>
			On Today, tap the person, then Shift note. Describe what you saw and the support you gave (you
			can ask Lomi to organise it), save the draft, tick “I reviewed this note”, then Sign and
			submit. Your supervisor reviews it after sync.
		</p>
	</details>
	<details>
		<summary>How do I find someone or something quickly?</summary>
		<p>
			Use Search in the app bar, or press Ctrl+K (⌘K on a Mac). It searches what is saved on this
			device, so it also works offline.
		</p>
	</details>
	<details>
		<summary>Someone else needs this device</summary>
		<p>
			Choose Lock device below. Your records stay encrypted on the device and open again with your
			PIN.
		</p>
	</details>
	<details>
		<summary>Coming from Therap? Words that mean the same thing</summary>
		<table class="terms">
			<thead><tr><th scope="col">In Guad</th><th scope="col">In Therap</th></tr></thead>
			<tbody>
				{#each terms as [guad, other] (guad)}<tr><td>{guad}</td><td>{other}</td></tr>{/each}
			</tbody>
		</table>
		<p class="muted">Your agency can show Therap’s words throughout Guad in Setup.</p>
	</details>
	{#if app.user.role === 'caregiver' && tipsHidden}<button class="textbtn" onclick={showTips}
			>Show getting-started tips again</button
		>{/if}
	{#if message}<p class="muted" role="status">{message}</p>{/if}
</section>

<style>
	details p {
		margin: 8px 0 0;
	}
	summary {
		font-weight: 600;
		min-height: 32px;
		cursor: pointer;
	}
	.terms {
		margin-top: 8px;
		border-collapse: collapse;
		width: 100%;
		font-size: 15px;
	}
	.terms th,
	.terms td {
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
	}
</style>
