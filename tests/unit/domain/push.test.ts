import { expect, it } from 'vitest';
import { pushNotificationId, pushPath, PUSH_NOTICE, pushNotice } from '../../../src/lib/domain/push';
const id = '2c048f72-4760-4c6e-bc76-73fd32cb9ac3';
it('ignores provider text and URLs and accepts only a canonical notification UUID', () => {
	const payload = {
		data: { notificationId: id, name: 'Private example', url: 'https://outside.test' },
		notification: { title: 'Private title', body: 'Private body' }
	};
	expect(pushNotificationId(payload)).toBe(id);
	expect(pushPath(pushNotificationId(payload)!)).toBe(`/notifications/${id}`);
	expect(JSON.stringify(PUSH_NOTICE)).not.toContain('Private');
	expect(pushNotice(payload)).toEqual({ id, title: 'Guad update', options: { body: 'Open Guad to review your alerts.', icon: '/icons/guad-192.png', tag: `guad-${id}`, data: { notificationId: id } } });
	expect(JSON.stringify(pushNotice(payload))).not.toMatch(/Private|outside/);
	expect(pushNotice({ notification: { title: 'Untrusted' } })).toBeNull();
	for (const value of [
		null,
		{},
		{ data: { notificationId: `${id}?secret=x` } },
		{ data: { notificationId: 'https://outside.test' } },
		{ data: { notificationId: `//outside.test/${id}` } }
	])
		expect(pushNotificationId(value)).toBeNull();
	expect(pushPath('/login?returnTo=https://outside.test')).toBe('/notifications');
});
