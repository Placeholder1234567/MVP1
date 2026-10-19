<script lang="ts">
	import { resolve } from '$app/paths';
	import { beforeNavigate } from '$app/navigation';
	import { useSession, parseJson } from './session.svelte';
	import {
		PROMPT_LEVELS,
		goalMilestone,
		shiftAt,
		isEditableByAuthor,
		type NoteStatus
	} from '#lib/domain/index.ts';
	import { trpc } from '#lib/trpc.ts';
	import LomiComposer from './LomiComposer.svelte';
	let {
		clientId,
		type = 'shift',
		noteId,
		offlineOnly = false,
		onBack,
		onDirtyChange
	}: {
		clientId?: string;
		type?: 'shift' | 'behavior';
		noteId?: string;
		offlineOnly?: boolean;
		onBack?: () => void;
		onDirtyChange?: (dirty: boolean) => void;
	} = $props();
	const app = useSession();
	const current = shiftAt(new Date(), app.user.timeZone);
	const note = $derived(
		noteId
			? app.notes.find((n) => n.id === noteId)
			: app.notes.find(
					(n) =>
						n.client_id === clientId &&
						n.type === type &&
						n.day === current.day &&
						n.shift === current.shift &&
						n.author_id === app.user.profileId
				)
	);
	const person = $derived(app.people.find((p) => p.id === (note?.client_id ?? clientId)));
	const kind = $derived(note?.type ?? type);
	const fields = $derived(
		kind === 'behavior'
			? [
					['before', 'What happened right before'],
					['behavior', 'What the person did'],
					['response', 'How staff responded'],
					['outcome', 'How it ended'],
					['duration', 'How long it lasted']
				]
			: [
					['activities', 'Activities'],
					['meals', 'Meals'],
					['mood', 'Mood'],
					['health', 'Health and safety']
				]
	);
	const goals = $derived(app.goals.filter((g) => g.client_id === person?.id && !g.stopped_at));
	// Shift note sections follow the charting preset's order (charting-ux.md
	// §2 "Section ordering"); the goal block sits where the preset puts it.
	const ordered = $derived.by(() => {
		if (kind === 'behavior') return { before: fields, after: [] as typeof fields };
		const order: string[] = app.labels.shiftOrder;
		const at = order.indexOf('goals');
		const pick = (keys: string[]) => keys.flatMap((k) => fields.filter(([key]) => key === k));
		return { before: pick(order.slice(0, at)), after: pick(order.slice(at + 1)) };
	});
	const editable = $derived(
		!note ||
			(note.author_id === app.user.profileId && isEditableByAuthor(note.status as NoteStatus))
	);
	let content = $state<Record<string, string>>({});
	let scores = $state<Record<string, { trials: string[]; notAttempted: boolean; reason: string }>>(
		{}
	);
	let loaded = $state('');
	let savedId = $state('');
	let busy = $state(false);
	let signed = $state(false);
	let message = $state('');
	let signature = $state(false);
	let dirty = $state(false);
	let assisted = $state(false);
	let scope = $state('');
	// Conflict feedback (offline-sync.md §5, frontend-spec-2.md §8.3): what
	// was on screen when another device's save replaced it, kept for this
	// session only, and a review that happened while this note was open.
	let overwritten = $state<{ content: Record<string, string>; scores: typeof scores } | null>(null);
	let conflict = $state('');
	let seenStatus = $state('');
	$effect(() => {
		onDirtyChange?.(dirty);
	});
	beforeNavigate(({ cancel }) => {
		if (
			dirty &&
			!confirm('Leave without saving your draft? Choose Cancel to save your changes first.')
		)
			cancel();
	});
	$effect(() => {
		const identity = `${noteId ?? clientId ?? ''}:${type}`;
		if (scope !== identity) {
			scope = identity;
			savedId = '';
			loaded = '';
			dirty = false;
			signature = false;
			signed = false;
			message = '';
			overwritten = null;
			conflict = '';
			seenStatus = '';
		}
		// A supervisor returned or approved the note while it was open here.
		const status = note?.status ?? '';
		if (
			seenStatus &&
			status !== seenStatus &&
			note?.author_id === app.user.profileId &&
			(status === 'returned' || status === 'approved')
		)
			conflict = `Your supervisor already ${status} this note.${
				status === 'returned' ? ' Read their comment, then sign it again.' : ''
			}`;
		seenStatus = status;
		const id = note?.id ?? person?.id ?? '';
		const sourceGoals = app.noteGoals.filter((g) => g.note_id === note?.id);
		const version = `${id}:${note?.updated_at ?? ''}:${JSON.stringify(sourceGoals)}`;
		if (!id || loaded === version || (dirty && loaded.startsWith(id + ':'))) return;
		// A server echo must never overwrite text currently being edited.
		if (dirty && id === savedId) {
			loaded = version;
			return;
		}
		const incoming = parseJson<Record<string, string>>(note?.content, {});
		// Our own save coming back (local write, then the server copy after sync)
		// changes nothing on screen, so it must not clear "I reviewed this note"
		// either: a caregiver may have ticked it in between.
		if (id === savedId && sameNote(incoming, sourceGoals)) {
			loaded = version;
			return;
		}
		// Another device's save replaced what this screen showed: say so, and
		// keep this version so it can be put back (an ordinary edit).
		if (
			loaded.startsWith(id + ':') &&
			note &&
			isEditableByAuthor(note.status as NoteStatus) &&
			!sameText(incoming)
		) {
			overwritten = {
				content: { ...content },
				scores: JSON.parse(JSON.stringify(scores))
			};
			conflict = 'This note was updated on another device.';
		}
		content = incoming;
		assisted = !!note?.lomi_drafted;
		scores = {};
		for (const row of sourceGoals) {
			scores[row.goal_id!] = {
				trials: parseJson<string[]>(row.trials, []),
				notAttempted: !!row.not_attempted,
				reason: row.reason ?? ''
			};
		}
		loaded = version;
		dirty = false;
		signature = false;
		signed = false;
	});
	/** The form already shows this content and goal data (key order aside: the server stores JSON). */
	/** Whether the note text matches what is on screen (goal rows aside: the server trims reasons). */
	function sameText(incoming: Record<string, string>) {
		const keys = new Set([...Object.keys(incoming), ...Object.keys(content)]);
		return [...keys].every((k) => (incoming[k] ?? '') === (content[k] ?? ''));
	}
	function sameNote(
		incoming: Record<string, string>,
		goalRows: {
			goal_id: string | null;
			trials: string | null;
			not_attempted: number | null;
			reason: string | null;
		}[]
	) {
		const keys = new Set([...Object.keys(incoming), ...Object.keys(content)]);
		if ([...keys].some((k) => (incoming[k] ?? '') !== (content[k] ?? ''))) return false;
		const goalIds = new Set([...goalRows.map((g) => g.goal_id!), ...Object.keys(scores)]);
		return [...goalIds].every((goalId) => {
			const row = goalRows.find((g) => g.goal_id === goalId);
			const form = scores[goalId];
			if (!row || !form) return false;
			return (
				JSON.stringify(parseJson<string[]>(row.trials, [])) === JSON.stringify(form.trials) &&
				!!row.not_attempted === form.notAttempted &&
				(row.reason ?? '') === form.reason
			);
		});
	}
	function addTrial(id: string, value: string) {
		dirty = true;
		const old = scores[id] ?? { trials: [], notAttempted: false, reason: '' };
		scores[id] = { ...old, trials: [...old.trials, value], notAttempted: false };
	}
	async function save(submit: boolean) {
		if (!app.db || !person || !editable || busy) return;
		message = '';
		if (submit && !signature) {
			message = 'Confirm that you reviewed this note before signing.';
			return;
		}
		if (submit && !Object.values(content).some((v) => v.trim())) {
			message = 'Add a description before signing.';
			return;
		}
		if (Object.values(scores).some((g) => g.notAttempted && !g.reason.trim())) {
			message = 'Say why each skipped goal was not attempted.';
			return;
		}
		busy = true;
		const id = note?.id ?? savedId ?? '';
		const target = id || crypto.randomUUID();
		savedId = target;
		const goalEntries = Object.entries(scores).map(([goalId, g]) => ({ goalId, ...g }));
		try {
			if (submit && note?.status === 'returned') {
				if (!app.db.currentStatus.connected || app.pending) {
					message =
						'Save your draft, then reconnect and wait for sync before signing a returned note.';
					return;
				}
				await trpc.note.update.mutate({
					id: target,
					content,
					goals: goalEntries,
					lomiDrafted: assisted ? true : undefined
				});
				await trpc.note.sign.mutate({ id: target });
			} else {
				const now = new Date().toISOString();
				await app.db.writeTransaction(async (tx) => {
					if (!note && !id)
						await tx.execute(
							'INSERT INTO notes (id, agency_id, home_id, client_id, author_id, author_name, day, shift, type, content, status, lomi_drafted, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
							[
								target,
								app.user.agencyId,
								person.home_id,
								person.id,
								app.user.profileId,
								app.user.name,
								current.day,
								current.shift,
								kind,
								JSON.stringify(content),
								'draft',
								assisted ? 1 : 0,
								app.user.profileId,
								now,
								now
							]
						);
					else
						await tx.execute(
							'UPDATE notes SET content = ?, lomi_drafted = ?, updated_at = ? WHERE id = ?',
							[JSON.stringify(content), assisted ? 1 : 0, now, target]
						);
					for (const g of goalEntries) {
						const existing = app.noteGoals.find(
							(row) => row.note_id === target && row.goal_id === g.goalId
						);
						if (existing)
							await tx.execute(
								'UPDATE note_goals SET trials = ?, not_attempted = ?, reason = ?, updated_at = ? WHERE id = ?',
								[
									JSON.stringify(g.notAttempted ? [] : g.trials),
									g.notAttempted ? 1 : 0,
									g.reason,
									now,
									existing.id
								]
							);
						else
							await tx.execute(
								'INSERT INTO note_goals (id, note_id, goal_id, home_id, trials, not_attempted, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
								[
									crypto.randomUUID(),
									target,
									g.goalId,
									person.home_id,
									JSON.stringify(g.notAttempted ? [] : g.trials),
									g.notAttempted ? 1 : 0,
									g.reason,
									now,
									now
								]
							);
					}
					if (submit)
						await tx.execute("UPDATE notes SET status = 'submitted', updated_at = ? WHERE id = ?", [
							now,
							target
						]);
				});
			}
			dirty = false;
			signed = submit;
			signature = false;
			conflict = '';
			overwritten = null;
			message = submit
				? 'Signed and saved. Your supervisor can review it after sync.'
				: 'Draft saved on this device.';
		} catch {
			message = 'Could not save your note. Your text is still here; please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}}
/>

<svelte:head
	><title>{kind === 'behavior' ? app.labels.behavior : app.labels.shift} · Guad</title></svelte:head
>
<div class="stack editor">
	{#if onBack}<button
			class="textbtn"
			onclick={() => {
				if (!dirty || confirm('Discard your unsaved note text?')) onBack();
			}}>← Saved records</button
		>{:else}<a class="textbtn" href={resolve('/(app)/today')}>← Back to today</a>{/if}
	{#if person}<div>
			<p class="eyebrow">{person.name}</p>
			<h1>{kind === 'behavior' ? app.labels.behavior : app.labels.shift}</h1>
			<p class="muted">
				{note?.day ?? current.day} · {(note?.shift ?? current.shift).toUpperCase()}
			</p>
		</div>
		{#if note?.supervisor_comment}<div class="callout warn">
				<b>Your supervisor’s feedback</b>
				<p class="record-text">{note.supervisor_comment}</p>
			</div>{/if}
		{#if signed}<div class="callout" role="status">
				<b>Your care is recorded.</b>
				<p>{message}</p>
			</div>{/if}
		{#if conflict}<div class="callout warn spread" role="status" data-testid="note-conflict">
				<span>{conflict}</span>
				{#if overwritten && editable}<button
						type="button"
						class="btn sec"
						onclick={() => {
							content = overwritten!.content;
							scores = overwritten!.scores;
							overwritten = null;
							conflict = '';
							dirty = true;
							signature = false;
						}}>Restore my version</button
					>{/if}
			</div>{/if}
		{#if assisted}<span class="pill">Lomi-assisted draft · review every section</span>{/if}
		{#if editable && !offlineOnly}{#key `${person.id}:${kind}`}<LomiComposer
					clientId={person.id}
					type={kind as 'shift' | 'behavior'}
					shift={(note?.shift ?? current.shift) as 'am' | 'pm' | 'on'}
					onDirty={() => {
						dirty = true;
						signature = false;
					}}
					onDraft={(result) => {
						content = result.content;
						assisted = true;
						dirty = true;
						signature = false;
					}}
				/>{/key}{/if}
		{#if !editable}<p class="callout">
				This note is {note?.status}. Signed records are read-only.
			</p>{/if}
		<form
			class="stack"
			onsubmit={(e) => {
				e.preventDefault();
				void save(false);
			}}
		>
			{#snippet sections(list: typeof fields)}<div class="card pad stack">
					{#each list as [key, label] (key)}<label
							>{label}<textarea
								class="input"
								bind:value={content[key]}
								oninput={() => (dirty = true)}
								disabled={!editable || busy}
								maxlength="10000"
								placeholder="Describe what you observed and the support provided."
							></textarea></label
						>{/each}
				</div>{/snippet}
			{@render sections(ordered.before)}
			{#if kind === 'shift' && goals.length}<h2>{app.labels.goals}</h2>
				{#each goals as goal (goal.id)}<section
						class="card pad stack"
						class:milestone={goalMilestone(scores[goal.id]?.trials ?? [])}
					>
						<div>
							<b>{goal.text}</b>
							<p class="muted">{goal.area}</p>
						</div>
						{#if scores[goal.id]?.trials.length}<div class="trial-list">
								{#each scores[goal.id].trials as trial, i (i)}<button
										type="button"
										disabled={!editable || busy}
										aria-label={`Remove trial ${i + 1}: ${trial}`}
										onclick={() => {
											scores[goal.id].trials.splice(i, 1);
											dirty = true;
										}}>{i + 1}. {trial} ×</button
									>{/each}
							</div>{/if}
						{#if goalMilestone(scores[goal.id]?.trials ?? [])}<p
								class="milestone-note"
								role="status"
							>
								<span class="milestone-check" aria-hidden="true">✓</span> Independent on every trial this
								shift
							</p>{/if}
						{#if editable}<label
								>Add a trial<select
									class="input"
									value=""
									disabled={busy || (scores[goal.id]?.trials.length ?? 0) >= 20}
									onchange={(e) => {
										if (e.currentTarget.value) addTrial(goal.id, e.currentTarget.value);
										e.currentTarget.value = '';
									}}
									><option value="">Choose the support used</option
									>{#each PROMPT_LEVELS as level (level)}<option>{level}</option>{/each}</select
								></label
							>
							<label class="checkline"
								><input
									type="checkbox"
									checked={scores[goal.id]?.notAttempted ?? false}
									disabled={busy}
									onchange={(e) => {
										scores[goal.id] = {
											trials: scores[goal.id]?.trials ?? [],
											notAttempted: e.currentTarget.checked,
											reason: scores[goal.id]?.reason ?? ''
										};
										dirty = true;
									}}
								/>Not attempted this shift</label
							>{/if}
						{#if scores[goal.id]?.notAttempted}<label
								>Why it was not attempted<input
									class="input"
									bind:value={scores[goal.id].reason}
									oninput={() => (dirty = true)}
									maxlength="500"
									disabled={!editable || busy}
								/></label
							>{/if}
					</section>{/each}{/if}
			{#if ordered.after.length}{@render sections(ordered.after)}{/if}
			{#if editable}<label class="checkline"
					><input type="checkbox" bind:checked={signature} disabled={busy} />I reviewed this note
					and confirm it accurately describes the care I provided.</label
				>
				<div class="actions">
					<button class="btn sec" disabled={busy}>Save draft</button><button
						type="button"
						class="btn"
						disabled={busy || !signature}
						onclick={() => save(true)}>{busy ? 'Saving…' : 'Sign and submit'}</button
					>
				</div>
				<p class="muted">
					Drafts and signed notes save on this device and sync when you reconnect.
				</p>{/if}
			{#if message && !signed}<p role="status">{message}</p>{/if}
		</form>{:else}<div class="card empty">This record is not available on your device.</div>{/if}
</div>
