import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Tx } from '../../../src/lib/server/db';
import type { CurrentUser } from '../../../src/lib/server/services/auth';
const f = vi.hoisted(() => ({
	request: vi.fn(),
	person: vi.fn(),
	counts: vi.fn(),
	record: vi.fn()
}));
vi.mock('google-auth-library', () => ({
	GoogleAuth: class {
		async getClient() {
			return { request: f.request };
		}
	}
}));
vi.mock('../../../src/lib/server/services/lomi/lomi.queries', () => ({
	personContext: f.person,
	invocationCounts: f.counts,
	recordInvocation: f.record
}));
vi.mock('../../../src/lib/server/db', () => ({
	withService: async (fn: (tx: unknown) => unknown) => fn({})
}));
import {
	draftNote,
	LomiRateLimitError,
	transcribeAudio
} from '../../../src/lib/server/services/lomi';
const user = { agencyId: 'agency', profileId: 'profile' } as CurrentUser;
beforeEach(() => {
	vi.clearAllMocks();
	f.person.mockResolvedValue({ firstName: 'Synthetic', goals: [] });
	f.counts.mockResolvedValue([]);
	vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'demo');
	vi.stubEnv('VERTEX_REGION', 'us-central1');
	vi.stubEnv('LOMI_MODEL', 'fixture-model');
});
afterEach(() => vi.unstubAllEnvs());
it('falls back on malformed provider output without exposing the provider error', async () => {
	f.request.mockResolvedValue({ data: { content: [{ type: 'text', text: 'invalid JSON' }] } });
	const result = await draftNote({} as Tx, user, {
		clientId: 'person',
		type: 'shift',
		prompt: 'Ate lunch.'
	});
	expect(result.fallback).toBe(true);
	expect(result.content.meals).toBe('Ate lunch.');
});
it('enforces user limits before transmitting a prompt', async () => {
	f.counts.mockResolvedValue(
		Array.from({ length: 10 }, () => ({ profileId: 'profile', meta: { task: 'draft' } }))
	);
	await expect(
		draftNote({} as Tx, user, { clientId: 'person', type: 'shift', prompt: 'Test.' })
	).rejects.toBeInstanceOf(LomiRateLimitError);
	expect(f.request).not.toHaveBeenCalled();
	expect(f.record).not.toHaveBeenCalled();
});
it('uses only allowed section keys from the provider and records the invocation without its text', async () => {
	f.request.mockResolvedValue({
		data: {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						activities: 'Test activity.',
						meals: '',
						mood: '',
						health: '',
						extra: 'discard'
					})
				}
			]
		}
	});
	const result = await draftNote({} as Tx, user, {
		clientId: 'person',
		type: 'shift',
		prompt: 'Test activity.'
	});
	expect(result.fallback).toBe(false);
	expect(result.content).not.toHaveProperty('extra');
	expect(f.record).toHaveBeenCalledWith({}, 'agency', 'profile', 'draft');
});
it('replaces a transcription provider error with a safe message', async () => {
	vi.stubEnv('STT_RECOGNIZER', 'projects/demo/locations/us-central1/recognizers/test');
	f.request.mockRejectedValue(new Error('Private upstream audio payload'));
	await expect(
		transcribeAudio(user, { audio: 'dGVzdA==', mimeType: 'audio/webm' })
	).rejects.toThrow('Could not transcribe this recording.');
});
