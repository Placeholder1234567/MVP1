// Install prompt counters (domain/pwa.ts InstallState) in the browser's
// private file storage, like the push opt-in. No PHI and no account data; the
// counts belong to the device, not the person. Storage that can't be read or
// written means no prompt, never a broken page.
import { NEW_INSTALL_STATE, parseInstallState, type InstallState } from '../domain/pwa';

const FILE = 'guad-install.json';

export async function readInstallState(): Promise<InstallState | null> {
	try {
		const directory = await navigator.storage.getDirectory();
		const file = await directory.getFileHandle(FILE, { create: true });
		const text = await (await file.getFile()).text();
		return text ? parseInstallState(JSON.parse(text)) : { ...NEW_INSTALL_STATE };
	} catch {
		return null;
	}
}

export async function updateInstallState(
	change: (state: InstallState) => Partial<InstallState>
): Promise<InstallState | null> {
	const state = await readInstallState();
	if (!state) return null;
	const next = { ...state, ...change(state) };
	try {
		const file = await (
			await navigator.storage.getDirectory()
		).getFileHandle(FILE, {
			create: true
		});
		const writer = await file.createWritable();
		await writer.write(JSON.stringify(next));
		await writer.close();
		return next;
	} catch {
		return null;
	}
}
