<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import { draftLocally, vagueFlags, type DraftResult, type NoteKind } from '#lib/domain/lomi.ts';
	import {
		applyAcceptedUpdates,
		flagKey,
		openSectionFlags,
		phraseRange,
		type DraftSection
	} from '#lib/domain/lomi-edit.ts';
	import { mergeReconnectDraft } from '#lib/domain/reconnect-draft.ts';
	import { lomiQuestions } from '#lib/domain/lomi-questions.ts';
	import LomiVoice from './LomiVoice.svelte';
	import { useSession } from './session.svelte';
	let {
		result,
		clientId,
		type,
		onUse,
		onDirty,
		voice = false,
		said = ''
	}: {
		result: DraftResult;
		/** What the caregiver typed or said, shown under "What I said" (frontend-spec-2 §6) */
		said?: string;
		clientId: string;
		type: NoteKind;
		voice?: boolean;
		onUse: (draft: DraftResult) => void;
		onDirty?: () => void;
	} = $props();
	const app = useSession();
	const original = untrack(() => ({
		result,
		clientId,
		type,
		said,
		profileId: app.user.profileId,
		homeId: app.homeId
	}));
	const originalContent = { ...original.result.content };
	let alive = false;
	let invalidated = false;
	$effect(() => {
		if (
			app.privacyLocked ||
			app.user.profileId !== original.profileId ||
			app.homeId !== original.homeId ||
			clientId !== original.clientId ||
			type !== original.type ||
			said !== original.said
		)
			invalidated = true;
	});
	let reconnectPending = $state(false);
	let refreshing = false;
	let manuallyEdited = $state(new Set<string>());
	let reconnectIncident = $state(false);
	onMount(() => {
		alive = true;
		const connected = () => {
			reconnectPending = true;
		};
		window.addEventListener('online', connected);
		return () => {
			alive = false;
			window.removeEventListener('online', connected);
		};
	});
	let content = $state<Record<string, string>>(untrack(() => ({ ...result.content })));
	let additions = $state<Record<string, string>>({});
	let followup = $state('');
	let busy = $state(false);
	let pending = $state<{
		updates: Array<{ section: string; text: string }>;
		fallback: boolean;
	} | null>(null);
	let message = $state('');
	let pendingSource = $state('');
	let usedAi = $state(!untrack(() => result.fallback));
	// Section text before the last accepted proposal, so it can be undone.
	let undo = $state<Record<string, string> | null>(null);
	// Vague phrases the caregiver chose to keep ("Keep as is"), per section.
	let kept = $state(new Set<string>());
	let voiceBusy = $state(false);
	// Sections the caregiver has tapped into: Lomi's text there is now theirs
	// (frontend-spec-2 §6 ghost text). Untouched ones stay slightly faded.
	let owned = $state<string[]>([]);
	let voiceMessage = $state('');
	const fields: Record<string, HTMLTextAreaElement | undefined> = {};
	const openFlags = $derived(openSectionFlags(content, kept));
	// Lomi's follow-up questions for empty or thin sections (ai-pipeline.md
	// "Proactive Questions"): at most three, from the draft itself.
	let skipped = $state(new Set<string>());
	const person = $derived(app.people.find((p) => p.id === clientId));
	const questions = $derived(
		lomiQuestions(content, person?.first_name || person?.name?.split(/\s+/)[0] || '', skipped)
	);
	const warnings = $derived.by(() => {
		const current = draftLocally(Object.values(content).join(' '), type);
		return {
			flags: vagueFlags(Object.values(content).join(' ')),
			incident: result.incident.detected
				? result.incident
				: reconnectIncident
					? { detected: true, summary: '' }
					: current.incident
		};
	});
	// No retry loop or original observations in browser storage. A later online event
	// can retry an unavailable service; the active review remains usable throughout.
	$effect(() => {
		if (!reconnectPending || busy || voiceBusy || pending || followup.trim()) return;
		reconnectPending = false;
		void untrack(refreshOnReconnect);
	});
	async function refreshOnReconnect() {
		if (
			!alive ||
			invalidated ||
			app.privacyLocked ||
			refreshing ||
			usedAi ||
			!original.result.fallback ||
			!original.said.trim()
		)
			return;
		if (
			clientId !== original.clientId ||
			type !== original.type ||
			said !== original.said ||
			app.user.profileId !== original.profileId ||
			app.homeId !== original.homeId
		)
			return;
		const protectedFields = () =>
			new Set([
				...manuallyEdited,
				...owned,
				...skipped,
				...Object.keys(additions).filter((key) => additions[key]?.trim()),
				...(kept.size ? Object.keys(content) : [])
			]);
		if (
			!Object.keys(originalContent).some(
				(key) => !protectedFields().has(key) && content[key] === originalContent[key]
			)
		)
			return;
		refreshing = true;
		try {
			const next = await trpc.lomi.draft.mutate({
				clientId: original.clientId,
				type: original.type,
				prompt: original.said
			});
			if (
				!alive ||
				invalidated ||
				app.privacyLocked ||
				next.fallback ||
				usedAi ||
				busy ||
				voiceBusy ||
				pending ||
				followup.trim() ||
				clientId !== original.clientId ||
				type !== original.type ||
				said !== original.said ||
				app.user.profileId !== original.profileId ||
				app.homeId !== original.homeId
			)
				return;
			const merged = mergeReconnectDraft(content, originalContent, next.content, protectedFields());
			if (!merged.updated.length) return;
			content = merged.content;
			reconnectIncident = next.incident.detected;
			usedAi = true;
			undo = null;
			message =
				'Lomi updated untouched sections after reconnecting. Your edits were kept. Review every section before using this draft.';
			onDirty?.();
		} catch {
			// Offline/fallback text and every caregiver edit remain unchanged.
		} finally {
			refreshing = false;
		}
	}
	function fix(section: string, phrase: string) {
		const field = fields[section];
		if (!field) return;
		field.focus();
		const range = phraseRange(content[section] ?? '', phrase);
		if (range) field.setSelectionRange(...range);
	}
	const goals = $derived(
		app.goals.filter((goal) => goal.client_id === clientId && !goal.stopped_at)
	);
	const labels: Record<string, string> = {
		activities: 'Activities',
		meals: 'Meals',
		mood: 'Mood',
		health: 'Health and safety',
		before: 'What happened right before',
		behavior: 'What the person did',
		response: 'How staff responded',
		outcome: 'How it ended',
		duration: 'How long it lasted'
	};
	function changed() {
		pending = null;
		onDirty?.();
	}
	async function refine(section: string) {
		if (busy || !additions[section]?.trim()) return;
		if (content[section].length > 6000) {
			message = 'This section is too long for assisted editing. Edit its text directly.';
			return;
		}
		busy = true;
		message = '';
		pending = null;
		try {
			const proposal = await trpc.lomi.edit.mutate({
				clientId,
				section: section as DraftSection,
				current: content[section],
				input: additions[section]
			});
			pending = { updates: [{ section, text: proposal.text }], fallback: proposal.fallback };
			pendingSource = section;
		} catch {
			message =
				'Assisted editing is unavailable. Your section and additional observations are unchanged; edit directly or try again.';
		} finally {
			busy = false;
		}
	}
	async function route() {
		if (busy || !followup.trim()) return;
		const current = {
			activities: content.activities ?? '',
			meals: content.meals ?? '',
			mood: content.mood ?? '',
			health: content.health ?? ''
		};
		if (
			Object.values(current).reduce((n, value) => n + value.length, 0) + followup.length > 8000 ||
			Object.values(current).some((value) => value.length > 6000)
		) {
			message = 'This draft is too long for assisted additions. Edit its sections directly.';
			return;
		}
		busy = true;
		message = '';
		pending = null;
		try {
			pending = await trpc.lomi.route.mutate({ clientId, current, message: followup });
			pendingSource = 'followup';
		} catch {
			message =
				'Assisted additions are unavailable. Your draft and observations are unchanged; edit directly or try again.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="stack" role="group" aria-label="Review Lomi draft">
	{#if said.trim()}<details class="said">
			<summary>What I said</summary>
			<p class="said-text">{said}</p>
		</details>{/if}
	<p class="callout warn">
		{usedAi
			? 'AI-generated draft. Check every section against what actually happened.'
			: 'Simple sorting draft. These are your original words; check their placement.'} Nothing is signed
		or saved until you choose to do so.
	</p>
	{#if questions.length}<section class="card pad stack" aria-labelledby="lomi-asks">
			<h3 id="lomi-asks">Lomi asks</h3>
			<ul class="asks">
				{#each questions as q (q.section)}<li>
						<button class="textbtn" type="button" onclick={() => fields[q.section]?.focus()}
							>{q.text}</button
						>
					</li>{/each}
			</ul>
		</section>{/if}
	{#each Object.entries(content) as [section] (section)}
		{@const flags = openFlags.filter((flag) => flag.section === section)}
		{@const question = questions.find((q) => q.section === section)}
		<section class="card pad stack">
			<label
				>{labels[section] ?? section}<textarea
					class="input"
					class:flagged={flags.length > 0}
					class:ghost={!owned.includes(section)}
					maxlength="10000"
					onfocus={() => {
						if (!owned.includes(section)) owned = [...owned, section];
					}}
					bind:this={fields[section]}
					bind:value={content[section]}
					disabled={busy || voiceBusy}
					oninput={() => {
						manuallyEdited = new Set([...manuallyEdited, section]);
						changed();
						undo = null;
					}}></textarea></label
			>
			{#each flags as flag (flag.phrase)}<div class="callout warn stack" role="note">
					<p>{flag.tip}</p>
					<div class="actions">
						<button class="btn sec" type="button" onclick={() => fix(section, flag.phrase)}
							>Fix it</button
						>
						<button
							class="textbtn"
							type="button"
							onclick={() => {
								kept = new Set([...kept, flagKey(section, flag.phrase)]);
							}}>Keep as is</button
						>
					</div>
				</div>{/each}
			{#if question}<div class="ask" role="note">
					<p><b>Lomi:</b> {question.text}</p>
					<button
						class="textbtn"
						type="button"
						onclick={() => (skipped = new Set([...skipped, section]))}>Skip, nothing to add</button
					>
				</div>{:else if !content[section]?.trim()}<p class="muted">
					Nothing was recorded here. Add what you observed, or leave this section blank.
				</p>{/if}
			<details>
				<summary>Refine {labels[section]?.toLowerCase() ?? section} with Lomi</summary>
				<div class="stack">
					<label
						>Additional observations or corrections for {labels[section]?.toLowerCase() ??
							section}<textarea
							class="input"
							maxlength="2000"
							bind:value={additions[section]}
							disabled={busy || voiceBusy}
							oninput={changed}></textarea></label
					>
					<div class="actions">
						{#if voice}<LomiVoice
								seconds={30}
								label="Speak · up to 30 seconds"
								disabled={busy || voiceBusy}
								onState={(state) => {
									voiceBusy = state.recording || state.busy;
									voiceMessage = state.message;
								}}
								onText={(clip) => {
									additions[section] = [additions[section], clip]
										.filter(Boolean)
										.join(' ')
										.slice(0, 2000);
									changed();
								}}
							/>{/if}
						<button
							class="btn sec"
							type="button"
							disabled={busy || voiceBusy || !additions[section]?.trim()}
							onclick={() => refine(section)}>Suggest a revision</button
						>
					</div>
					<button
						class="textbtn"
						type="button"
						disabled={busy || !additions[section]}
						onclick={() => {
							additions[section] = '';
							pending = null;
						}}>Clear these observations</button
					>
				</div>
			</details>
		</section>
	{/each}
	{#if type === 'shift'}
		<section class="card pad stack">
			<h3>Add more to this draft</h3>
			<p class="muted">
				Describe additional observations or a correction. Review Lomi’s proposed sections before
				applying them.
			</p>
			<label
				>Follow-up observations<textarea
					class="input"
					maxlength="2000"
					bind:value={followup}
					disabled={busy || voiceBusy}
					oninput={changed}></textarea></label
			>
			<button class="btn sec" type="button" disabled={busy || !followup.trim()} onclick={route}
				>Suggest section updates</button
			>
			<button
				class="textbtn"
				type="button"
				disabled={busy || !followup}
				onclick={() => {
					followup = '';
					pending = null;
				}}>Clear follow-up observations</button
			>
		</section>
	{/if}
	{#if busy}<p role="status">Preparing a suggestion. Your current draft is unchanged.</p>{/if}
	{#if message || voiceMessage}<p role="status">{message || voiceMessage}</p>{/if}
	{#if undo && !pending}<div class="actions">
			<button
				class="textbtn"
				type="button"
				onclick={() => {
					if (!undo) return;
					content = { ...content, ...undo };
					undo = null;
					message = 'Last accepted change undone.';
					onDirty?.();
				}}>Undo last accepted change</button
			>
		</div>{/if}
	{#if pending}
		<section class="callout stack" aria-label="Proposed changes">
			<h3>Review proposed changes</h3>
			<p>
				{pending.fallback
					? 'Lomi is unavailable. This suggestion appends your words using simple sorting; review carefully.'
					: 'AI-generated suggestion. Compare it with the current sections above.'}
			</p>
			{#each pending.updates as update (update.section)}<div>
					<b>{labels[update.section] ?? update.section}</b>
					<p class="muted record-text">Now: {content[update.section]?.trim() || '(empty)'}</p>
					<p class="record-text">Proposed: {update.text}</p>
				</div>{/each}
			<div class="actions">
				<button
					class="btn sec"
					type="button"
					onclick={() => {
						pending = null;
					}}>Discard suggestion</button
				>
				<button
					class="btn"
					type="button"
					onclick={() => {
						if (!pending) return;
						const applied = applyAcceptedUpdates(content, pending.updates);
						content = applied.content;
						undo = applied.previous;
						usedAi = usedAi || !pending.fallback;
						pending = null;
						if (pendingSource === 'followup') followup = '';
						else additions[pendingSource] = '';
						onDirty?.();
						message =
							'Changes applied to this review draft. Review every section before using it in your note.';
					}}>Apply proposed changes</button
				>
			</div>
		</section>
	{/if}
	{#if warnings.incident.detected}<p class="callout bad">
			This description may need a separate incident report. Follow your agency’s reporting
			procedure.
		</p>{/if}
	{#if type === 'shift' && goals.length}
		<section class="card pad stack">
			<h3>Goal observations to review</h3>
			<p class="muted">
				Goal references are suggestions, not scores. Record each trial’s actual support level in
				your note below.
			</p>
			{#each goals as goal (goal.id)}
				{@const reference = result.goalReferences?.find((item) => item.goalId === goal.id)}
				<div>
					<b>{goal.text}</b>
					<p class="muted">
						{reference
							? `Possible original observation: “${reference.evidence}”`
							: 'No matched observation. Review whether this goal was attempted.'}
					</p>
				</div>
			{/each}
		</section>
	{/if}
	<button
		class="btn sec"
		type="button"
		disabled={busy ||
			voiceBusy ||
			!!pending ||
			openFlags.length > 0 ||
			Object.values(additions).some((value) => value.trim()) ||
			!!followup.trim()}
		onclick={() => {
			if (
				!confirm(
					'Replace the note sections below with this reviewed draft? Your goal scores will remain unchanged.'
				)
			)
				return;
			onUse({
				...result,
				content: { ...content },
				flags: warnings.flags,
				incident: warnings.incident,
				fallback: !usedAi
			});
		}}>Use this reviewed draft in my note</button
	>
	<p class="muted">
		{openFlags.length ? 'Fix or keep each flagged phrase first. ' : ''}Finish or clear additional
		observations and proposed changes before using the draft. Goal scores remain unchanged. You must
		review and sign separately.
	</p>
</div>

<style>
	summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.stack {
		min-width: 0;
	}
	/* Lomi's words until the caregiver taps in: opacity only, no badge or icon. */
	.ghost {
		opacity: 0.85;
	}
	textarea {
		transition: opacity 150ms ease;
	}
	@media (prefers-reduced-motion: reduce) {
		textarea {
			transition: none;
		}
	}
	.flagged {
		background: var(--flag-bg);
		box-shadow: inset 0 -2px 0 var(--flag-line);
	}
	.record-text {
		overflow-wrap: anywhere;
	}
	/* The original words, for checking the draft against (frontend-spec-2 §6). */
	.said-text {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.asks {
		margin: 0;
		padding-left: 1.2em;
	}
	.ask {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 12px;
		color: var(--muted);
	}
	.ask p {
		margin: 0;
	}
</style>
