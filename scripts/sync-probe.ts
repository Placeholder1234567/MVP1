// Dev tool: asks local PowerSync what it would sync to a seeded user's device.
//   npm run sync:probe -- cara@guad.test
// Prints row counts per table, never row contents.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createSyncCredential } from '../src/lib/server/identity';

const email = process.argv[2];
process.env.GOOGLE_CLOUD_PROJECT ??= 'demo-guad';
const app = getApps()[0] ?? initializeApp({ projectId: 'demo-guad' });
const uid = (await getAuth(app).getUserByEmail(email)).uid;
const cred = await createSyncCredential(uid);
if (cred.kind !== 'powersync-token') throw new Error('expected dev token');

const res = await fetch('http://localhost:8080/sync/stream', {
	method: 'POST',
	headers: { 'content-type': 'application/json', authorization: `Token ${cred.token}` },
	body: JSON.stringify({ raw_data: true, streams: { include_defaults: true, subscriptions: [] } }),
	signal: AbortSignal.timeout(8000)
});
console.log('HTTP', res.status);
const rows = new Map<string, Set<string>>();
let ops = 0;
let complete = false;
let buf = '';
try {
	const reader = res.body!.getReader();
	while (!complete) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += new TextDecoder().decode(value);
		let nl;
		while ((nl = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, nl);
			buf = buf.slice(nl + 1);
			if (!line.trim()) continue;
			const msg = JSON.parse(line);
			if (msg.data)
				for (const op of msg.data.data) {
					ops++;
					if (!rows.has(op.object_type)) rows.set(op.object_type, new Set());
					rows.get(op.object_type)!.add(op.object_id);
				}
			if (msg.checkpoint_complete) complete = true;
			if (msg.error || res.status >= 400)
				console.log('message:', JSON.stringify(msg).slice(0, 300));
		}
	}
} catch (e) {
	console.log('stream ended:', (e as Error).name);
}
const counts = Object.fromEntries([...rows].map(([t, ids]) => [t, ids.size]));
console.log(
	email,
	complete ? 'checkpoint complete' : 'no complete checkpoint',
	`(${ops} ops)`,
	counts
);
process.exit(0);
