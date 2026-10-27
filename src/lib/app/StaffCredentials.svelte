<script lang="ts">
	// Staff training and certifications (domain/credentials.ts). Three uses:
	// - one person's, on Staff (admins add, renew and remove them);
	// - the agency's expiring and expired ones, at the top of Staff;
	// - your own, on Me.
	// Needs a connection; never synced.
	import { untrack } from 'svelte';
	import { trpc } from '#lib/trpc.ts';
	import { dayLabel } from '#lib/domain/time.ts';
	import {
		CREDENTIAL_KINDS,
		CREDENTIAL_LABEL,
		type CredentialKind,
		type CredentialStatus
	} from '#lib/domain/credentials.ts';

	let {
		profileId = null,
		canEdit = false,
		attentionOnly = false,
		title = 'Training and certifications'
	}: {
		/** One person's; null for everyone the caller can see */
		profileId?: string | null;
		canEdit?: boolean;
		/** Only expiring and expired ones (the Staff overview) */
		attentionOnly?: boolean;
		title?: string;
	} = $props();

	type Credential = Awaited<ReturnType<typeof trpc.staff.credentials.query>>[number];
	let rows = $state<Credential[] | null>(null);
	let message = $state('');
	let busy = $state(false);
	// null: closed; '': adding; otherwise the credential being renewed
	let editing = $state<string | null>(null);
	const blank = () => ({
		kind: 'cpr' as CredentialKind,
		name: '',
		issuedOn: '',
		expiresOn: ''
	});
	let form = $state(blank());

	const STATUS: Record<CredentialStatus, { text: string; pill: string }> = {
		current: { text: 'Current', pill: 'ok' },
		expiring: { text: 'Expiring soon', pill: 'warn' },
		expired: { text: 'Expired', pill: 'bad' },
		no_expiry: { text: 'No expiry', pill: '' }
	};
	const shown = $derived(
		(rows ?? []).filter((r) => !attentionOnly || r.status === 'expiring' || r.status === 'expired')
	);

	async function load() {
		message = '';
		try {
			rows = await trpc.staff.credentials.query(profileId ? { profileId } : {});
		} catch {
			rows = null;
			message = 'Connect to see training and certifications.';
		}
	}
	// Start over when the person changes.
	$effect(() => {
		void profileId;
		untrack(() => {
			rows = null;
			editing = null;
			form = blank();
			void load();
		});
	});

	function open(c?: Credential) {
		editing = c?.id ?? '';
		form = c
			? {
					kind: c.kind as CredentialKind,
					name: c.name,
					issuedOn: c.issuedOn ?? '',
					expiresOn: c.expiresOn ?? ''
				}
			: blank();
		message = '';
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!profileId || editing === null) return;
		busy = true;
		message = '';
		try {
			await trpc.staff.saveCredential.mutate({
				...(editing ? { id: editing } : {}),
				profileId,
				kind: form.kind,
				name: form.kind === 'other' ? form.name : undefined,
				issuedOn: form.issuedOn || null,
				expiresOn: form.expiresOn || null
			});
			editing = null;
			message = 'Saved.';
			await load();
		} catch (e) {
			// Keep what was typed.
			message = e instanceof Error ? e.message : 'Could not save. Check your connection.';
		} finally {
			busy = false;
		}
	}

	async function remove(c: Credential) {
		if (!confirm(`Remove ${c.name}? Its history stays in the audit log.`)) return;
		busy = true;
		message = '';
		try {
			await trpc.staff.removeCredential.mutate({ id: c.id });
			await load();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not remove. Check your connection.';
		} finally {
			busy = false;
		}
	}
</script>

<section class="stack" aria-label={title}>
	<h2>{title}</h2>
	{#if canEdit && profileId && editing === null}<div class="actions">
			<button type="button" class="btn sec" disabled={busy || !rows} onclick={() => open()}
				>Add training or certification</button
			>
		</div>{/if}
	{#if editing !== null}
		<form class="card pad stack" onsubmit={save} aria-label="Training or certification">
			<label
				>Type<select class="input" bind:value={form.kind} disabled={busy || !!editing}
					>{#each CREDENTIAL_KINDS as k (k)}<option value={k}>{CREDENTIAL_LABEL[k]}</option
						>{/each}</select
				></label
			>
			{#if form.kind === 'other'}<label
					>Name<input
						class="input"
						required
						maxlength="120"
						placeholder="For example: Mandt, G-tube, seizure care"
						bind:value={form.name}
						disabled={busy}
					/></label
				>{/if}
			<label
				>Issued on (if known)<input
					class="input"
					type="date"
					bind:value={form.issuedOn}
					disabled={busy}
				/></label
			>
			<label
				>Valid through (leave empty if it doesn't expire)<input
					class="input"
					type="date"
					min={form.issuedOn || undefined}
					bind:value={form.expiresOn}
					disabled={busy}
				/></label
			>
			<div class="actions">
				<button class="btn" disabled={busy}>{editing ? 'Save renewal' : 'Save'}</button>
				<button type="button" class="btn sec" disabled={busy} onclick={() => (editing = null)}
					>Cancel</button
				>
			</div>
		</form>
	{/if}
	{#if message}<p class="callout" role="status">{message}</p>{/if}
	{#if rows}
		<div class="list card" role="list">
			{#each shown as c (c.id)}
				<div class="row" role="listitem">
					<span class="grow"
						><b>{profileId ? c.name : `${c.profileName} · ${c.name}`}</b><span class="muted"
							>{c.expiresOn
								? `${c.status === 'expired' ? 'Expired' : 'Valid through'} ${dayLabel(c.expiresOn)}, ${c.expiresOn.slice(0, 4)}`
								: 'Does not expire'}</span
						></span
					>
					<span class="pill {STATUS[c.status].pill}">{STATUS[c.status].text}</span>
					{#if canEdit && profileId}<button
							type="button"
							class="btn sec"
							disabled={busy}
							aria-label="Renew {c.name}"
							onclick={() => open(c)}>Renew</button
						><button
							type="button"
							class="btn sec"
							disabled={busy}
							aria-label="Remove {c.name}"
							onclick={() => remove(c)}>Remove</button
						>{/if}
				</div>
			{:else}
				<div class="row muted" role="listitem">
					{attentionOnly ? 'Nothing expiring in the next 30 days.' : 'None recorded yet.'}
				</div>
			{/each}
		</div>
	{/if}
</section>
