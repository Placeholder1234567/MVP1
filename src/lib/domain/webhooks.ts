// Webhook rules (openapi.yaml /webhooks, WebhookPayload). Events come from
// the audit trail: the audit_row_change trigger records every insert and
// update on these tables with old and new values, so each event is a pure
// function of one audit row and no service has to remember to publish it.
// Payloads carry IDs and status only, never PHI.

export const WEBHOOK_EVENTS = [
	'incident.created',
	'incident.reviewed',
	'note.submitted',
	'note.approved',
	'coverage.created',
	'coverage.filled',
	'coverage.unfilled',
	'clock.in',
	'clock.out',
	'client.created',
	'referral.created',
	'mar.recorded',
	'health.flagged'
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** The audited tables events come from. */
export const WEBHOOK_TABLES = [
	'incidents',
	'notes',
	'coverage_requests',
	'clock_records',
	'clients',
	'referrals',
	'mar_records',
	'health_entries'
] as const;

export interface AuditChange {
	table_name: string;
	action: 'INSERT' | 'UPDATE' | 'DELETE';
	old_values: Record<string, unknown> | null;
	new_values: Record<string, unknown> | null;
}

type Row = Record<string, unknown>;
const pick = (row: Row, keys: Record<string, string>) =>
	Object.fromEntries(Object.entries(keys).map(([out, key]) => [out, row[key] ?? null]));
const changedTo = (c: AuditChange, key: string, value: unknown) =>
	c.new_values?.[key] === value && (c.action === 'INSERT' || c.old_values?.[key] !== value);

/** The webhook event for one audited change, if any. */
export function webhookEventFor(
	c: AuditChange
): { event: WebhookEvent; data: Record<string, unknown> } | null {
	const row = c.new_values;
	if (!row || c.action === 'DELETE') return null;
	const insert = c.action === 'INSERT';
	switch (c.table_name) {
		case 'incidents': {
			const data = pick(row, {
				id: 'id',
				client_id: 'client_id',
				home_id: 'home_id',
				severity: 'severity',
				status: 'status',
				occurred_at: 'occurred_at'
			});
			if (insert) return { event: 'incident.created', data };
			if (row.status !== 'open' && c.old_values?.status === 'open')
				return { event: 'incident.reviewed', data };
			return null;
		}
		case 'notes': {
			const data = {
				...pick(row, {
					id: 'id',
					client_id: 'client_id',
					home_id: 'home_id',
					note_type: 'type',
					shift: 'shift',
					status: 'status',
					author_id: 'author_id'
				}),
				submitted_at: row.updated_at ?? null
			};
			if (changedTo(c, 'status', 'submitted')) return { event: 'note.submitted', data };
			if (changedTo(c, 'status', 'approved')) return { event: 'note.approved', data };
			return null;
		}
		case 'coverage_requests': {
			const data = pick(row, { id: 'id', home_id: 'home_id', shift: 'shift', date: 'day' });
			if (insert) return { event: 'coverage.created', data };
			if (changedTo(c, 'status', 'filled'))
				return { event: 'coverage.filled', data: { ...data, filled_by: row.filled_by ?? null } };
			if (changedTo(c, 'status', 'unfilled')) return { event: 'coverage.unfilled', data };
			return null;
		}
		case 'clock_records': {
			const base = pick(row, {
				clock_record_id: 'id',
				profile_id: 'profile_id',
				home_id: 'home_id',
				verified: 'verified',
				distance_meters: 'distance_meters'
			});
			if (insert)
				return { event: 'clock.in', data: { ...base, timestamp: row.clock_in_at ?? null } };
			if (row.clock_out_at && !c.old_values?.clock_out_at)
				return { event: 'clock.out', data: { ...base, timestamp: row.clock_out_at } };
			return null;
		}
		case 'clients':
			return insert
				? {
						event: 'client.created',
						data: pick(row, { id: 'id', home_id: 'home_id', active: 'active' })
					}
				: null;
		case 'referrals':
			return insert
				? {
						event: 'referral.created',
						data: pick(row, { id: 'id', status: 'status', home_id: 'assigned_home_id' })
					}
				: null;
		case 'mar_records':
			return insert
				? {
						event: 'mar.recorded',
						data: pick(row, {
							id: 'id',
							client_id: 'client_id',
							medication_id: 'medication_id',
							status: 'status',
							recorded_by: 'recorded_by',
							recorded_at: 'recorded_at'
						})
					}
				: null;
		case 'health_entries': {
			const flags = row.flags;
			return insert && Array.isArray(flags) && flags.length
				? {
						event: 'health.flagged',
						data: pick(row, {
							id: 'id',
							client_id: 'client_id',
							entry_type: 'kind',
							recorded_at: 'recorded_at'
						})
					}
				: null;
		}
		default:
			return null;
	}
}

export class WebhookUrlError extends Error {}

/** HTTPS only, no credentials in the URL, at most 2,048 characters. */
export function checkWebhookUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new WebhookUrlError('Enter a full https:// URL');
	}
	if (url.protocol !== 'https:') throw new WebhookUrlError('Webhook URLs must use https://');
	if (url.username || url.password)
		throw new WebhookUrlError('Webhook URLs cannot contain a user name or password');
	if (raw.length > 2048) throw new WebhookUrlError('Webhook URLs are limited to 2,048 characters');
	return url;
}

/**
 * Private, loopback, link-local, metadata and other non-public addresses
 * (openapi.yaml createWebhook: SSRF). Accepts IPv4, IPv6 and IPv4-mapped IPv6.
 */
export function isPrivateAddress(ip: string): boolean {
	const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
			(a === 169 && b === 254) || // link-local, cloud metadata
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 192 && b === 0) ||
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224 // multicast and reserved
		);
	}
	const v6 = ip.toLowerCase();
	if (!v6.includes(':')) return true; // not an address we understand: refuse
	return (
		v6 === '::' ||
		v6 === '::1' ||
		v6.startsWith('fc') ||
		v6.startsWith('fd') || // unique local fc00::/7
		/^fe[89ab]/.test(v6) || // link-local fe80::/10
		v6.startsWith('ff') || // multicast
		v6.startsWith('64:ff9b:') || // NAT64 can reach IPv4 private ranges
		v6.startsWith('::') || // IPv4-compatible (::a.b.c.d) and mapped forms not matched above
		v6.startsWith('2002:') || // 6to4 wraps an IPv4 address, private ones included
		/^2001:0?:/.test(v6) || // Teredo tunnels to IPv4
		/^2001:0?db8:/.test(v6) || // documentation range
		/^100::/.test(v6) // discard-only
	);
}

/** Delivery attempts and the wait before each retry (minutes). */
export const WEBHOOK_RETRY_MINUTES = [1, 5, 30, 120] as const;
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_MINUTES.length + 1;
