import { describe, expect, it } from 'vitest';
import { render } from '../../../src/lib/server/messaging/templates';

const n = {
	id: 'n1',
	type: 'system_maintenance',
	title: 'Guad will undergo scheduled maintenance on Tue, Oct 20 from 10:00 PM to 11:30 PM EDT.',
	body: 'Syncing will pause.'
};

describe('maintenance announcements', () => {
	it('show the window on the lock screen; it is system information only', () => {
		expect(render('push', n)).toMatchObject({
			title: 'Guad: Scheduled maintenance',
			body: n.title
		});
	});

	it('email the window and what to expect', () => {
		const d = render('email', n);
		expect(d.title).toBe('Scheduled maintenance');
		expect(d.body).toBe(`${n.title}\n\n${n.body}`);
	});

	it('other alerts keep the generic push text', () => {
		expect(render('push', { ...n, type: 'note_submitted' }).body).toBe('Open Guad to see details.');
	});
});
