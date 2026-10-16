import * as env from '$app/env/public';
import { firebaseAuth } from '../auth/firebase';
import { trpc } from '../trpc';
import { PushController } from './push-controller';
import { readPushRegistration, writePushRegistration, markPushEnabled } from './push-storage';

export function pushConfigured(): boolean {
	return !!(
		env.PUBLIC_FIREBASE_API_KEY &&
		env.PUBLIC_FIREBASE_PROJECT_ID &&
		!env.PUBLIC_FIREBASE_PROJECT_ID.startsWith('demo-') &&
		env.PUBLIC_FIREBASE_APP_ID &&
		env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
		/^B[A-Za-z0-9_-]{86}$/.test(env.PUBLIC_FIREBASE_VAPID_KEY ?? '') &&
		!env.PUBLIC_AUTH_EMULATOR_URL
	);
}
export function pushAvailable(): boolean {
	return (
		globalThis.isSecureContext &&
		typeof Notification !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in globalThis
	);
}
async function sdk() {
	const module = await import('firebase/messaging');
	return { module, messaging: module.getMessaging(firebaseAuth().app) };
}
async function registration() {
	const value = await navigator.serviceWorker.getRegistration();
	if (!value?.active) throw new Error('App update required');
	await new Promise<void>((resolve, reject) => {
		const channel = new MessageChannel();
		const timeout = setTimeout(() => {
			channel.port1.close();
			reject(new Error('App update required'));
		}, 1500);
		channel.port1.onmessage = (event) => {
			clearTimeout(timeout);
			channel.port1.close();
			if (event.data?.guadPushVersion === 1) resolve();
			else reject(new Error('App update required'));
		};
		value.active!.postMessage({ type: 'guad-push-version' }, [channel.port2]);
	});
	return value;
}
let current: { profileId: string; controller: PushController } | undefined;
let control: BroadcastChannel | undefined;
function controls() {
	if (!control && typeof BroadcastChannel !== 'undefined') {
		control = new BroadcastChannel('guad-push-control');
		control.onmessage = (event) => {
			if (event.data === 'off') {
				current?.controller.cancel();
				void markPushEnabled(false).catch(() => {});
				globalThis.dispatchEvent(new Event('guad-push-disabled'));
			}
		};
	}
	return control;
}
export function webPushController(profileId: string, serverConfigured: boolean): PushController {
	controls();
	if (current?.profileId === profileId) return current.controller;
	current?.controller.cancel();
	const controller = new PushController(profileId, {
		configured: serverConfigured && pushConfigured(),
		available: pushAvailable,
		permission: () => Notification.permission,
		requestPermission: () =>
			Notification.permission === 'granted'
				? Promise.resolve('granted')
				: Notification.requestPermission(),
		supported: async () => (await import('firebase/messaging')).isSupported(),
		getToken: async () => {
			const serviceWorkerRegistration = await registration();
			const { module, messaging } = await sdk();
			return module.getToken(messaging, {
				serviceWorkerRegistration,
				vapidKey: env.PUBLIC_FIREBASE_VAPID_KEY
			});
		},
		deleteToken: async () => {
			const { module, messaging } = await sdk();
			try {
				await module.deleteToken(messaging);
			} finally {
				const installations = await import('firebase/installations');
				await installations.deleteInstallations(installations.getInstallations(firebaseAuth().app));
			}
		},
		unsubscribe: async () => {
			const registration = await navigator.serviceWorker.getRegistration();
			const subscription = await registration?.pushManager.getSubscription();
			if (subscription && !(await subscription.unsubscribe())) throw new Error('Push cleanup unavailable');
		},
		read: readPushRegistration,
		write: writePushRegistration,
		mark: markPushEnabled,
		register: (token, previousId) =>
			trpc.notification.registerPushDevice.mutate({ token, platform: 'web', previousId }),
		remove: (id) => trpc.notification.removePushDevice.mutate({ id })
	});
	current = { profileId, controller };
	return controller;
}
/** Logout never waits indefinitely for a provider. The worker opt-in is revoked first. */
export async function stopWebPush(profileId: string): Promise<boolean> {
	controls()?.postMessage('off');
	const controller =
		current?.profileId === profileId
			? current.controller
			: webPushController(profileId, pushConfigured());
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			controller.disable(),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(() => resolve(false), 4000);
			})
		]);
	} catch {
		/* Logout remains available when delivery cleanup fails. */
		return false;
	} finally {
		clearTimeout(timer);
		current = undefined;
		globalThis.dispatchEvent(new Event('guad-push-disabled'));
	}
}
