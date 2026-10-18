import { describe, expect, it } from 'vitest';
import {
	checkWebhookUrl,
	isPrivateAddress,
	WebhookUrlError,
	webhookEventFor
} from '../../../src/lib/domain/webhooks';

const change = (
	table_name: string,
	action: 'INSERT' | 'UPDATE' | 'DELETE',
	new_values: Record<string, unknown> | null,
	old_values: Record<string, unknown> | null = null
) => ({ table_name, action, new_values, old_values });

describe('webhookEventFor', () => {
	it('maps inserts to created events with IDs and status only', () => {
		const e = webhookEventFor(
			change('incidents', 'INSERT', {
				id: 'i1',
				client_id: 'c1',
				home_id: 'h1',
				severity: 'High',
				status: 'open',
				occurred_at: 'x',
				description: 'Synthetic text'
			})
		);
		expect(e).toEqual({
			event: 'incident.created',
			data: {
				id: 'i1',
				client_id: 'c1',
				home_id: 'h1',
				severity: 'High',
				status: 'open',
				occurred_at: 'x'
			}
		});
	});

	it('fires note events only when the status changes to that state', () => {
		const submitted = change(
			'notes',
			'UPDATE',
			{ id: 'n', status: 'submitted', type: 'shift' },
			{ status: 'draft' }
		);
		expect(webhookEventFor(submitted)?.event).toBe('note.submitted');
		expect(webhookEventFor(submitted)?.data.note_type).toBe('shift');
		expect(
			webhookEventFor(change('notes', 'UPDATE', { status: 'submitted' }, { status: 'submitted' }))
		).toBeNull();
		expect(
			webhookEventFor(change('notes', 'UPDATE', { status: 'approved' }, { status: 'submitted' }))
				?.event
		).toBe('note.approved');
		expect(webhookEventFor(change('notes', 'INSERT', { status: 'draft' }))).toBeNull();
	});

	it('covers reviews, coverage, clock out and flagged health only', () => {
		expect(
			webhookEventFor(change('incidents', 'UPDATE', { status: 'reviewed' }, { status: 'open' }))
				?.event
		).toBe('incident.reviewed');
		expect(
			webhookEventFor(
				change(
					'coverage_requests',
					'UPDATE',
					{ status: 'filled', filled_by: 'p' },
					{ status: 'searching' }
				)
			)
		).toMatchObject({ event: 'coverage.filled', data: { filled_by: 'p' } });
		expect(
			webhookEventFor(
				change('clock_records', 'UPDATE', { id: 'k', clock_out_at: 't' }, { clock_out_at: null })
			)
		).toMatchObject({ event: 'clock.out', data: { clock_record_id: 'k', timestamp: 't' } });
		expect(webhookEventFor(change('health_entries', 'INSERT', { flags: [] }))).toBeNull();
		expect(
			webhookEventFor(change('health_entries', 'INSERT', { flags: ['pulse'], kind: 'vitals' }))
				?.data
		).toMatchObject({
			entry_type: 'vitals'
		});
		expect(webhookEventFor(change('clients', 'DELETE', null))).toBeNull();
		expect(webhookEventFor(change('profiles', 'INSERT', { id: 'p' }))).toBeNull();
	});
});

describe('webhook URLs and addresses', () => {
	it('accepts plain https URLs only', () => {
		expect(checkWebhookUrl('https://hooks.example.test/x').hostname).toBe('hooks.example.test');
		for (const bad of ['http://hooks.example.test', 'https://user:pw@hooks.example.test', 'hooks'])
			expect(() => checkWebhookUrl(bad)).toThrow(WebhookUrlError);
	});

	it('refuses private, loopback, link-local and metadata addresses', () => {
		for (const ip of [
			'10.1.2.3',
			'127.0.0.1',
			'169.254.169.254',
			'172.16.0.1',
			'192.168.1.1',
			'100.64.0.1',
			'0.0.0.0',
			'::1',
			'fd00::1',
			'fe80::1',
			'::ffff:10.0.0.1',
			'::ffff:7f00:1',
			'::127.0.0.1',
			'::7f00:1',
			'2002:a00:1::1',
			'2001:0:4136:e378::1',
			'2001:db8::1',
			'100::1',
			'nonsense'
		])
			expect(isPrivateAddress(ip), ip).toBe(true);
		for (const ip of [
			'93.184.216.34',
			'8.8.8.8',
			'2606:4700:4700::1111',
			'2001:4860:4860::8888',
			'172.32.0.1'
		])
			expect(isPrivateAddress(ip), ip).toBe(false);
	});
});
