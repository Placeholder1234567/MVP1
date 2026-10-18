<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { useSession } from '#lib/app/session.svelte.ts';
	import { trpc } from '#lib/trpc.ts';
	import GoalTrend from '#lib/app/GoalTrend.svelte';
	const app = useSession();
	type Goal = Awaited<ReturnType<typeof trpc.goal.list.query>>[number];
	type Template = Awaited<ReturnType<typeof trpc.goal.listTemplates.query>>[number];
	let homeId = $state(untrack(() => app.homeId));
	let personId = $state('');
	let goals = $state<Goal[]>([]);
	let templates = $state<Template[]>([]);
	let loading = $state(false),
		templateLoading = $state(false),
		busy = $state(false);
	let message = $state(''),
		templateMessage = $state('');
	let editing = $state(''),
		area = $state(''),
		text = $state(''),
		steps = $state(''),
		frequency = $state(''),
		target = $state('');
	let dirty = $state(false);
	let templateArea = $state(''),
		templateText = $state(''),
		templateSteps = $state(''),
		templateDirty = $state(false),
		areaFilter = $state('');
	let version = 0;
	let online = $state(true);
	let loadedPerson = $state('');
	$effect(() => {
		if (!homeId && app.homeId && !dirty) homeId = app.homeId;
	});
	const people = $derived(app.people.filter((p) => p.home_id === homeId));
	const person = $derived(people.find((p) => p.id === personId));
	const active = $derived(goals.filter((g) => !g.stoppedAt));
	const stopped = $derived(goals.filter((g) => g.stoppedAt));
	function leaveGoal() {
		return !dirty || confirm('Discard the unsaved goal changes?');
	}
	function clearGoal() {
		editing = '';
		area = '';
		text = '';
		steps = '';
		frequency = '';
		target = '';
		dirty = false;
	}
	function parsedSteps(value: string) {
		const entries = value
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (entries.length > 30 || entries.some((s) => s.length > 1000))
			throw new Error('Invalid steps');
		return entries;
	}
	async function loadGoals() {
		const id = personId,
			current = ++version;
		goals = [];
		loadedPerson = '';
		message = '';
		loading = false;
		if (!id) return;
		loading = true;
		try {
			const rows = await trpc.goal.list.query({ clientId: id, includeStopped: true });
			if (current === version) {
				goals = rows;
				loadedPerson = id;
			}
		} catch {
			if (current === version)
				message =
					'Could not load goals. Reconnect and retry. Lists can contain up to 500 goals per person.';
		} finally {
			if (current === version) loading = false;
		}
	}
	async function loadTemplates() {
		templateLoading = true;
		templateMessage = '';
		try {
			templates = await trpc.goal.listTemplates.query({ area: areaFilter.trim() || undefined });
		} catch {
			templateMessage =
				'Could not load templates. Reconnect or narrow the list by exact area (up to 500 templates).';
		} finally {
			templateLoading = false;
		}
	}
	onMount(() => {
		homeId ||= app.homeId;
		online = navigator.onLine;
		void loadTemplates();
	});
	beforeNavigate(({ cancel, type }) => {
		if (type === 'leave') {
			if (dirty || templateDirty || busy) cancel();
			return;
		}
		if (
			busy ||
			((dirty || templateDirty) && !confirm('Leave without saving your goal or template changes?'))
		)
			cancel();
	});
	async function saveGoal(event: SubmitEvent) {
		event.preventDefault();
		if (!online) {
			message = 'Reconnect to save this goal. Your draft entries are kept.';
			return;
		}
		if (busy || !person || (!editing && !person.active)) return;
		busy = true;
		message = '';
		try {
			const fields = {
				area: area.trim(),
				text: text.trim(),
				steps: parsedSteps(steps),
				frequency: frequency.trim(),
				target: target.trim()
			};
			if (!fields.area || !fields.text) throw new Error('Invalid goal');
			const row = editing
				? await trpc.goal.update.mutate({ id: editing, ...fields })
				: await trpc.goal.create.mutate({ clientId: personId, ...fields });
			goals = [...goals.filter((g) => g.id !== row.id), row];
			clearGoal();
			message = 'Goal saved. Care records receive the change after sync.';
		} catch {
			message =
				'Could not save the goal. Your entries are kept. Reconnect, check the field limits, or reload if this goal was stopped elsewhere.';
		} finally {
			busy = false;
		}
	}
	function editGoal(goal: Goal) {
		if (!leaveGoal()) return;
		editing = goal.id;
		area = goal.area;
		text = goal.text;
		steps = (goal.steps ?? []).join('\n');
		frequency = goal.frequency ?? '';
		target = goal.target ?? '';
		dirty = false;
		message = '';
	}
	async function stopGoal(goal: Goal) {
		if (!online) {
			message = 'Reconnect before stopping a goal. No change has been made.';
			return;
		}
		if (
			busy ||
			!confirm(
				'Stop this goal? It will leave active care forms after sync. Its definition and recorded trials remain in history, and it cannot be edited afterwards.'
			)
		)
			return;
		if (editing === goal.id && !leaveGoal()) return;
		busy = true;
		message = '';
		try {
			const row = await trpc.goal.stop.mutate({ id: goal.id });
			goals = goals.map((g) => (g.id === row.id ? { ...g, ...row } : g));
			if (editing === row.id) clearGoal();
			message = 'Goal stopped. Its history is preserved.';
		} catch {
			message = 'Could not stop the goal. Reconnect and retry; the current record is kept.';
		} finally {
			busy = false;
		}
	}
	function useTemplate(template: Template) {
		if (!person || !leaveGoal()) return;
		clearGoal();
		area = template.area;
		text = template.text;
		steps = (template.steps ?? []).join('\n');
		dirty = true;
		message = 'Template copied into a new draft. Review it for this person, then save the goal.';
	}
	async function saveTemplate(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		if (!online) {
			templateMessage = 'Reconnect to save this template. Your draft entries are kept.';
			return;
		}
		busy = true;
		templateMessage = '';
		try {
			const row = await trpc.goal.createTemplate.mutate({
				area: templateArea.trim(),
				text: templateText.trim(),
				steps: parsedSteps(templateSteps)
			});
			if (!areaFilter.trim() || row.area === areaFilter.trim()) templates = [...templates, row];
			templateArea = '';
			templateText = '';
			templateSteps = '';
			templateDirty = false;
			templateMessage = 'Agency template saved.';
		} catch {
			templateMessage =
				'Could not save the template. Your entries are kept. Reconnect and check the field limits.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Manage goals · Guad</title></svelte:head>
<svelte:window
	ononline={() => (online = true)}
	onoffline={() => (online = false)}
	onbeforeunload={(e) => {
		if (dirty || templateDirty || busy) {
			e.preventDefault();
			e.returnValue = '';
		}
	}}
/>
<div class="stack goals-page">
	<p class="eyebrow">Care planning</p>
	<h1>Goals that guide support.</h1>
	<p class="muted">
		Manage current definitions and preserve stopped goals. Changes require a connection; offline
		care charting continues in the saved workspace. Nothing here signs a clinical note or changes
		recorded trials.
	</p>
	{#if !online}<p class="callout" role="status">
			Reconnect to manage goals and templates. Unsaved entries stay in this open page; management
			changes are not queued offline.
		</p>{/if}
	<div class="card pad grid">
		<label
			>Goal home<select
				class="input"
				value={homeId}
				disabled={busy || loading}
				onchange={(e) => {
					if (!leaveGoal()) {
						e.currentTarget.value = homeId;
						return;
					}
					homeId = e.currentTarget.value;
					personId = '';
					clearGoal();
					void loadGoals();
				}}
				>{#each app.homes as home (home.id)}<option value={home.id}>{home.name}</option
					>{/each}</select
			></label
		>
		<label
			>Goal person<select
				class="input"
				value={personId}
				disabled={busy || loading}
				onchange={(e) => {
					if (!leaveGoal()) {
						e.currentTarget.value = personId;
						return;
					}
					personId = e.currentTarget.value;
					clearGoal();
					void loadGoals();
				}}
				><option value="">Choose a person</option>{#each people as p (p.id)}<option value={p.id}
						>{p.name}{!p.active ? ' (archived)' : ''}</option
					>{/each}</select
			></label
		>
	</div>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if loading}<p role="status">Loading goals…</p>{:else if person}
		<div class="section-title">
			<h2>Active goals · {person.name}</h2>
			<button
				class="btn sec"
				disabled={busy}
				onclick={() => {
					if (leaveGoal()) {
						clearGoal();
						void loadGoals();
					}
				}}>Reload goals</button
			>
		</div>
		{#each active as goal (goal.id)}<article class="card pad stack" aria-label="Active goal">
				<p class="eyebrow">{goal.area}</p>
				<h3 class="record-text">{goal.text}</h3>
				{#if goal.frequency}<p>Frequency: {goal.frequency}</p>{/if}{#if goal.target}<p>
						Target: {goal.target}
					</p>{/if}
				{#if goal.steps?.length}<ol>
						{#each goal.steps as step, i (`${goal.id}:${i}`)}<li>{step}</li>{/each}
					</ol>{/if}
				<GoalTrend clientId={personId} {homeId} goalId={goal.id} />
				<div class="actions">
					<button class="btn sec" disabled={busy} onclick={() => editGoal(goal)}>Edit goal</button
					><button class="textbtn" disabled={busy} onclick={() => stopGoal(goal)}>Stop goal</button>
				</div>
			</article>{:else}<p class="card empty">
				{loadedPerson === personId
					? 'No active goals for this person.'
					: 'Goals have not loaded. Reconnect and choose Reload goals.'}
			</p>{/each}
		<form
			class="card pad stack"
			aria-label="Goal editor"
			onsubmit={saveGoal}
			oninput={() => (dirty = true)}
		>
			<h2>{editing ? 'Edit goal definition' : 'Add a goal'}</h2>
			{#if !person.active && !editing}<p class="callout">
					Choose an active person to create a goal. Existing records remain available below.
				</p>{/if}
			<label
				>Goal area<input
					class="input"
					required
					maxlength="120"
					bind:value={area}
					disabled={busy}
				/></label
			>
			<label
				>Goal wording<textarea
					class="input"
					required
					maxlength="2000"
					bind:value={text}
					disabled={busy}></textarea></label
			>
			<label
				>Steps, one per line<textarea
					class="input"
					maxlength="30030"
					bind:value={steps}
					disabled={busy}></textarea></label
			>
			<p class="muted">Up to 30 steps, 1,000 characters each. Empty lines are ignored.</p>
			<div class="grid">
				<label
					>How often<input
						class="input"
						maxlength="200"
						bind:value={frequency}
						disabled={busy}
					/></label
				><label
					>Goal target<input
						class="input"
						maxlength="500"
						bind:value={target}
						disabled={busy}
					/></label
				>
			</div>
			<div class="actions">
				<button class="btn" disabled={busy || (!editing && !person.active)}
					>{editing ? 'Save goal changes' : 'Create goal'}</button
				><button
					type="button"
					class="btn sec"
					disabled={busy}
					onclick={() => {
						if (leaveGoal()) clearGoal();
					}}>Cancel goal changes</button
				>
			</div>
		</form>
		<details>
			<summary>Stopped goals ({stopped.length})</summary>
			<div class="stack">
				{#each stopped as goal (goal.id)}<article class="card pad stack" aria-label="Stopped goal">
						<p class="eyebrow">{goal.area} · Stopped</p>
						<h3 class="record-text">{goal.text}</h3>
						<p class="muted">
							Stopped {goal.stoppedAt?.toLocaleString()}. This definition is read-only; recorded
							trials remain in history.
						</p>
						<GoalTrend clientId={personId} {homeId} goalId={goal.id} />
						{#if goal.steps?.length}<ol>
								{#each goal.steps as step, i (`${goal.id}:${i}`)}<li>{step}</li>{/each}
							</ol>{/if}
					</article>{:else}<p class="muted">No stopped goals for this person.</p>{/each}
			</div>
		</details>
	{:else}<p class="card empty">Choose a person to load their current and stopped goals.</p>{/if}
	<section class="stack" aria-label="Agency goal templates">
		<h2>Agency templates</h2>
		<p class="muted">
			Templates supply wording and steps. Review each draft for the selected person. Only templates
			already provisioned in this agency are listed.
		</p>
		<form
			class="actions"
			onsubmit={(e) => {
				e.preventDefault();
				void loadTemplates();
			}}
		>
			<label
				>Exact template area<input
					class="input"
					maxlength="120"
					bind:value={areaFilter}
					disabled={templateLoading || busy}
				/></label
			><button class="btn sec" disabled={templateLoading || busy}>Load templates</button>
		</form>
		{#if templateMessage}<p class="callout" role="status">{templateMessage}</p>{/if}
		{#if templateLoading}<p role="status">Loading templates…</p>{/if}
		{#each templates as template (template.id)}<article
				class="card pad stack"
				aria-label="Goal template"
			>
				<p class="eyebrow">
					{template.area} · {template.isDefault ? 'Provisioned default' : 'Agency template'}
				</p>
				<h3 class="record-text">{template.text}</h3>
				{#if template.steps?.length}<ol>
						{#each template.steps as step, i (`${template.id}:${i}`)}<li>{step}</li>{/each}
					</ol>{/if}<button
					class="btn sec"
					disabled={busy || !person?.active}
					onclick={() => useTemplate(template)}>Use template for selected person</button
				>
			</article>{:else}{#if !templateLoading}<p class="muted">
					No templates loaded. Add one below or retry with an exact area.
				</p>{/if}{/each}
		<form
			class="card pad stack"
			aria-label="New agency template"
			onsubmit={saveTemplate}
			oninput={() => (templateDirty = true)}
		>
			<h3>Create an agency template</h3>
			<label
				>Template area<input
					class="input"
					required
					maxlength="120"
					bind:value={templateArea}
					disabled={busy}
				/></label
			><label
				>Template wording<textarea
					class="input"
					required
					maxlength="2000"
					bind:value={templateText}
					disabled={busy}></textarea></label
			><label
				>Template steps, one per line<textarea
					class="input"
					maxlength="30030"
					bind:value={templateSteps}
					disabled={busy}></textarea></label
			>
			<p class="muted">
				Up to 30 steps of 1,000 characters. This creates an agency template, not a system default.
			</p>
			<button class="btn" disabled={busy}>Save agency template</button>
		</form>
	</section>
</div>

<style>
	.goals-page {
		max-width: 780px;
	}
	summary {
		min-height: 44px;
		cursor: pointer;
		display: list-item;
		padding-block: 10px;
	}
	article {
		overflow-wrap: anywhere;
	}
	ol {
		padding-inline-start: 24px;
	}
</style>
