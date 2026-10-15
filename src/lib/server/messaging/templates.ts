// PHI-free message text per channel (notifications.md §1, §6). Push payloads
// carry only a generic title; details are shown in the app after sign-in.
// SMS stays under 160 characters.
import type { Delivery } from './index.ts';

export function render(
	channel: 'push' | 'sms' | 'email',
	n: { id: string; title: string }
): Delivery {
	const link = `/notifications/${n.id}`;
	if (channel === 'push') {
		return {
			notificationId: n.id,
			title: 'Guad: Action needed',
			body: 'Open Guad to see details.',
			link
		};
	}
	if (channel === 'sms') {
		const body = `Guad: ${n.title}. Open the app to review.`;
		return { notificationId: n.id, title: n.title, body: body.slice(0, 160), link };
	}
	return {
		notificationId: n.id,
		title: n.title,
		body: `${n.title}. Sign in to Guad to see the details.`,
		link
	};
}
