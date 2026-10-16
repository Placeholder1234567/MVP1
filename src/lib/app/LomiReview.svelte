<script lang="ts">
	import { untrack } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import { draftLocally, vagueFlags, type DraftResult, type NoteKind } from '#lib/domain/lomi.ts';
	import {
		applyAcceptedUpdates,
		flagKey,
		openSectionFlags,
		phraseRange,
		type DraftSection
	} from '#lib/domain/lomi-edit.ts';
	import LomiVoice from './LomiVoice.svelte';
	import { useSession } from './session.svelte';
	let {
		result,
		clientId,
		type,
		onUse,
		onDirty,
		voice = false
	}: {
		result: DraftResult;
		clientId: string;
		type: NoteKind;
		voice?: boolean;
		onUse: (draft: DraftResult) => void;
		onDirty?: () => void;
	} = $props();
	const app = useSession();
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
	let voiceMessage = $state('');
	const fields: Record<string, HTMLTextAreaElement | undefined> = {};
	const openFlags = $derived(openSectionFlags(content, kept));
	const warnings = $derived.by(() => {
		const current = draftLocally(Object.values(content).join(' '), type);
		return {
			flags: vagueFlags(Object.values(content).join(' ')),
			incident: result.incident.detected ? result.incident : current.incident
		};
	});
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

<div class="stack" aria-label="Review Lomi draft">
	<p class="callout warn">
		{usedAi
			? 'AI-generated draft. Check every section against what actually happened.'
			: 'Simple sorting draft. These are your original words; check their placement.'} Nothing is signed
		or saved until you choose to do so.
	</p>
	{#each Object.entries(content) as [section] (section)}
		{@const flags = openFlags.filter((flag) => flag.section === section)}
		<section class="card pad stack">
			<label
				>{labels[section] ?? section}<textarea
					class="input"
					class:flagged={flags.length > 0}
					maxlength="10000"
					bind:this={fields[section]}
					bind:value={content[section]}
					disabled={busy || voiceBusy}
					oninput={() => {
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
			{#if !content[section]?.trim()}<p class="muted">
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
	.flagged {
		background: #ffe9a8;
		box-shadow: inset 0 -2px 0 #b45a14;
	}
	.record-text {
		overflow-wrap: anywhere;
	}
</style>
