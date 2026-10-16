const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Payload text and URLs are never trusted or copied to the notification surface. */
export function pushNotificationId(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null;
	const data = (value as { data?: unknown }).data;
	if (!data || typeof data !== 'object') return null;
	const id = (data as { notificationId?: unknown }).notificationId;
	return typeof id === 'string' && UUID.test(id) ? id.toLowerCase() : null;
}
export function pushPath(id: string): string {
	return UUID.test(id) ? `/notifications/${id.toLowerCase()}` : '/notifications';
}
export const PUSH_NOTICE = {
	title: 'Guad update',
	body: 'Open Guad to review your alerts.',
	icon: '/icons/guad-192.png'
};
export function pushNotice(value: unknown) {
	const id = pushNotificationId(value);
	return id ? { id, title: PUSH_NOTICE.title, options: { body: PUSH_NOTICE.body, icon: PUSH_NOTICE.icon, tag: `guad-${id}`, data: { notificationId: id } } } : null;
}
