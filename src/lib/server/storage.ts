// File storage for generated reports (infrastructure.md: Cloud Storage, a
// private bucket; locally a folder). With EXPORTS_BUCKET set, files go to that
// bucket through the Cloud Storage JSON API using the service account
// (google-auth-library); otherwise to .data/exports under the project. Files
// are only ever read back by the server, which checks access first.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

export interface Storage {
	put(path: string, body: Buffer, contentType: string): Promise<void>;
	get(path: string): Promise<Buffer | null>;
	remove(path: string): Promise<void>;
}

const SAFE = /^[a-z0-9][a-z0-9/_.-]{0,250}$/i;
function checkPath(path: string) {
	if (!SAFE.test(path) || path.includes('..')) throw new Error('Invalid storage path');
}

export function localFileStorage(root: string): Storage {
	const full = (path: string) => {
		checkPath(path);
		const p = resolve(root, path);
		if (!p.startsWith(resolve(root) + sep)) throw new Error('Invalid storage path');
		return p;
	};
	return {
		async put(path, body) {
			const p = full(path);
			await mkdir(dirname(p), { recursive: true });
			await writeFile(p, body);
		},
		async get(path) {
			try {
				return await readFile(full(path));
			} catch {
				return null;
			}
		},
		async remove(path) {
			await rm(full(path), { force: true });
		}
	};
}

function bucketStorage(bucket: string): Storage {
	const auth = new GoogleAuth({
		scopes: ['https://www.googleapis.com/auth/devstorage.read_write']
	});
	const object = (path: string) => {
		checkPath(path);
		return encodeURIComponent(path);
	};
	const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`;
	return {
		async put(path, body, contentType) {
			const client = await auth.getClient();
			await client.request({
				url: `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${object(path)}`,
				method: 'POST',
				headers: { 'content-type': contentType },
				data: body,
				retry: false
			});
		},
		async get(path) {
			const client = await auth.getClient();
			try {
				const res = await client.request<ArrayBuffer>({
					url: `${base}/${object(path)}?alt=media`,
					responseType: 'arraybuffer',
					retry: false
				});
				return Buffer.from(res.data);
			} catch (e) {
				if ((e as { response?: { status?: number } }).response?.status === 404) return null;
				throw e;
			}
		},
		async remove(path) {
			const client = await auth.getClient();
			try {
				await client.request({ url: `${base}/${object(path)}`, method: 'DELETE', retry: false });
			} catch (e) {
				if ((e as { response?: { status?: number } }).response?.status !== 404) throw e;
			}
		}
	};
}

let storage: Storage | undefined;
export function fileStorage(): Storage {
	storage ??= process.env.EXPORTS_BUCKET
		? bucketStorage(process.env.EXPORTS_BUCKET)
		: localFileStorage(join(process.cwd(), '.data', 'exports'));
	return storage;
}

/** Tests use a temporary folder or memory. */
export function setStorageForTests(s: Storage | undefined) {
	storage = s;
}
