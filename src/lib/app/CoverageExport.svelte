<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { useSession } from './session.svelte';
	import { ReportJobGuard, reportCanConnect } from './report-job';
	import { trpc } from '#lib/trpc.ts';
	import { addDays, localTime } from '#lib/domain/index.ts';
	const app = useSession();
	const today = localTime(new Date(), app.user.timeZone).day;
	let fromDay = $state(addDays(today, -6));
	let toDay = $state(today);
	let format = $state<'csv' | 'json'>('csv');
	let busy = $state(false);
	let message = $state('');
	let online = $state(false);
	let visible = $state(false);
	let controller: AbortController | undefined;
	const fullReports = $derived(app.user.features.includes('reports'));
	$effect(() => {
		if (!fullReports) format = 'csv';
	});
	const guard = new ReportJobGuard();
	const context = () =>
		JSON.stringify([
			app.user.agencyId,
			app.user.profileId,
			app.user.role,
			app.user.homeIds,
			app.user.features,
			app.homeId,
			app.privacyLocked
		]);
	const allowedHome = $derived(app.user.role === 'admin' || app.user.homeIds.includes(app.homeId));
	const canConnect = $derived(reportCanConnect(online, visible, app.privacyLocked));
	$effect(() => {
		if (guard.change(context())) {
			controller?.abort();
			busy = false;
			message = '';
		}
	});
	onMount(() => {
		const update = () => {
			online = navigator.onLine;
			visible = document.visibilityState === 'visible';
			if (!online || !visible) {
				controller?.abort();
				guard.change(`unavailable-${Date.now()}`);
				busy = false;
			}
		};
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		document.addEventListener('visibilitychange', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
			document.removeEventListener('visibilitychange', update);
		};
	});
	onDestroy(() => {
		controller?.abort();
		guard.change('disposed');
	});
	async function download(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !canConnect || !app.homeId || !allowedHome) return;
		guard.change(context());
		const stillCurrent = guard.capture();
		const original = context();
		const current = () => stillCurrent() && original === context() && canConnect && allowedHome;
		const p = { homeId: app.homeId, expectedProfileId: app.user.profileId, fromDay, toDay, format };
		const request = new AbortController();
		controller = request;
		busy = true;
		message = '';
		try {
			await app.refreshUploadStatus();
			if (!current()) return;
			if (app.pending || app.checkingSync) {
				message = 'Wait for this device’s changes to finish syncing before exporting.';
				return;
			}
			const file = await trpc.report.exportCoverage.mutate(p, { signal: request.signal });
			if (!current() || request.signal.aborted) return;
			const url = URL.createObjectURL(new Blob([file.content], { type: file.contentType }));
			const link = document.createElement('a');
			link.href = url;
			link.download = file.filename;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message = `Downloaded ${file.rows} source records for ${p.fromDay} through ${p.toDay}. Keep exports in approved agency storage.`;
		} catch (e) {
			if (current() && !request.signal.aborted)
				message =
					(e as { data?: { code?: string } })?.data?.code === 'BAD_REQUEST' && e instanceof Error
						? e.message
						: 'Could not export. Check your connection, account, selected home and report permissions.';
		} finally {
			if (stillCurrent()) busy = false;
		}
	}
</script>

<section class="card pad stack" aria-label="Coverage log export">
	<h2>Coverage log</h2>
	<p class="muted">
		Callouts, recorded candidates and replies, current fill outcomes and activity for the selected
		home. Dates use the shift start day in {app.user.timeZone}.
	</p>
	<p class="muted">
		Eligibility is not proof an offer was sent. Prospective offer evidence covers this home under
		your current access. Legacy personal notification records remain limited to your own recipient
		records unless you are an admin. Queued and provider-accepted messages are not proof of device
		delivery; supported provider callbacks are labeled separately. Missing evidence is unknown.
		Names are current labels.
	</p>
	<form class="stack" onsubmit={download}>
		<p>
			Home: {app.homes.find((h) => h.id === app.homeId)?.name ??
				'Choose a home in the app navigation'}
		</p>
		<div class="grid">
			<label
				>Coverage from<input
					class="input"
					type="date"
					required
					bind:value={fromDay}
					disabled={busy}
				/></label
			>
			<label
				>Coverage through<input
					class="input"
					type="date"
					required
					bind:value={toDay}
					disabled={busy}
				/></label
			>
		</div>
		<label for="coverage-export-format">Coverage format</label>
		<select id="coverage-export-format" class="input" bind:value={format} disabled={busy}>
			<option value="csv">CSV spreadsheet</option>
			{#if fullReports}<option value="json">Structured JSON</option>{/if}
		</select>
		<p class="muted">
			Maximum 93 inclusive calendar days, 1,000 total source records and 8 MB. Excessive reports are
			refused without a partial download. Related activity and replies reflect current records, not
			a snapshot at the period end. Exports contain confidential information.
		</p>
		{#if !online}<p role="status">
				Reconnect to download server records. Your selected dates stay here.
			</p>{/if}
		{#if !allowedHome}<p role="status">Choose a currently assigned home to export coverage.</p>{/if}
		<button
			class="btn"
			disabled={busy ||
				!canConnect ||
				!app.homeId ||
				!allowedHome ||
				!!app.pending ||
				app.checkingSync}>{busy ? 'Preparing coverage log…' : 'Download coverage log'}</button
		>
	</form>
	{#if message}<p class="callout" role="status">{message}</p>{/if}
</section>
