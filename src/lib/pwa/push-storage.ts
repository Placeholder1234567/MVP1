// Only delivery opt-in and opaque registration/profile IDs; never SDK/Auth tokens or PHI.
const FILE = 'guad-push-registration.json';
export interface PushRegistration {
	profileId: string;
	id: string;
}
export async function readPushRegistration(): Promise<PushRegistration | null> {
	try {
		const file = await (await navigator.storage.getDirectory()).getFileHandle(FILE);
		const value = JSON.parse(await (await file.getFile()).text());
		return typeof value?.id === 'string' && typeof value?.profileId === 'string'
			? { id: value.id, profileId: value.profileId }
			: null;
	} catch {
		return null;
	}
}
export async function writePushRegistration(value: PushRegistration | null): Promise<void> {
	const directory = await navigator.storage.getDirectory();
	if (!value) {
		await directory.removeEntry(FILE).catch(() => {});
		return;
	}
	const file = await directory.getFileHandle(FILE, { create: true });
	const writer = await file.createWritable();
	await writer.write(JSON.stringify(value));
	await writer.close();
}
export async function markPushEnabled(enabled: boolean): Promise<void> {
	const file = await (
		await navigator.storage.getDirectory()
	).getFileHandle('guad-push-opt-in.json', { create: true });
	const writer = await file.createWritable();
	await writer.write(JSON.stringify({ enabled }));
	await writer.close();
}
/** Workers fail closed if consent cannot be read, including on cleared or blocked storage. */
export async function pushEnabled(): Promise<boolean> {
	try {
		const file = await (
			await navigator.storage.getDirectory()
		).getFileHandle('guad-push-opt-in.json');
		return JSON.parse(await (await file.getFile()).text()).enabled === true;
	} catch {
		return false;
	}
}
