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
	editSection,
	routeObservations,
	LomiRateLimitError,
	transcribeAudio
} from '../../../src/lib/server/services/lomi';
const user = { agencyId: 'agency', profileId: 'profile', features: ['goals'] } as CurrentUser;
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

it('uses server-loaded goals and accepts only grounded references', async () => {
	f.person.mockResolvedValue({
		firstName: 'Synthetic',
		goals: [{ id: 'active', text: 'Brush teeth', area: 'Daily living' }]
	});
	f.request.mockResolvedValue({
		data: {
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						activities: 'Brushed teeth.',
						meals: '',
						mood: '',
						health: '',
						goalReferences: [
							{ goalId: 'active', evidence: 'Brushed teeth.', trials: ['Independent'] },
							{ goalId: 'another-person', evidence: 'Brushed teeth.' }
						]
					})
				}
			]
		}
	});
	const result = await draftNote({} as Tx, user, {
		clientId: 'person',
		type: 'shift',
		prompt: 'Brushed teeth.'
	});
	expect(result.goalReferences).toEqual([{ goalId: 'active', evidence: 'Brushed teeth.' }]);
	expect(JSON.parse(f.request.mock.calls[0][0].data.messages[0].content).activeGoals).toEqual([
		{ id: 'active', text: 'Brush teeth', area: 'Daily living' }
	]);
});
it('checks person access before any refinement request', async () => {
	f.person.mockResolvedValue(null);
	await expect(
		editSection({} as Tx, user, {
			clientId: 'other',
			section: 'meals',
			current: '',
			input: 'Ate lunch.'
		})
	).rejects.toThrow('That person is not in your homes');
	expect(f.request).not.toHaveBeenCalled();
	expect(f.record).not.toHaveBeenCalled();
});
it('returns an explicit proposed revision and applies the edit rate limit', async () => {
	f.request.mockResolvedValue({
		data: { content: [{ type: 'text', text: '{"text":"Ate lunch and drank water."}' }] }
	});
	const result = await editSection({} as Tx, user, {
		clientId: 'person',
		section: 'meals',
		current: 'Ate lunch.',
		input: 'Drank water.'
	});
	expect(result).toEqual({ text: 'Ate lunch and drank water.', fallback: false });
	expect(f.record).toHaveBeenCalledWith({}, 'agency', 'profile', 'edit');
	f.counts.mockResolvedValue(
		Array.from({ length: 60 }, () => ({ profileId: 'profile', meta: { task: 'edit' } }))
	);
	await expect(
		editSection({} as Tx, user, {
			clientId: 'person',
			section: 'meals',
			current: '',
			input: 'Test.'
		})
	).rejects.toBeInstanceOf(LomiRateLimitError);
	expect(f.request).toHaveBeenCalledTimes(1);
});
it('retains the exact observations in a safe fallback when editing fails', async () => {
	f.request.mockRejectedValue(new Error('private provider payload'));
	expect(
		await editSection({} as Tx, user, {
			clientId: 'person',
			section: 'meals',
			current: 'Ate lunch.',
			input: 'Drank water.'
		})
	).toEqual({ text: 'Ate lunch. Drank water.', fallback: true });
});
it('rejects unknown or duplicate routed sections and never alters goal outcomes', async () => {
	f.request.mockResolvedValue({
		data: {
			content: [
				{
					type: 'text',
					text: JSON.stringify({ updates: [{ section: 'goal_scores', text: 'Independent' }] })
				}
			]
		}
	});
	const result = await routeObservations({} as Tx, user, {
		clientId: 'person',
		message: 'Ate lunch.',
		current: { activities: 'Walked.', meals: 'Ate breakfast.', mood: '', health: '' }
	});
	expect(result).toEqual({
		updates: [{ section: 'meals', text: 'Ate breakfast. Ate lunch.' }],
		fallback: true
	});
	expect(f.record).toHaveBeenCalledWith({}, 'agency', 'profile', 'route');
});
it('uses the fast model for routed suggestions and validates replacements', async () => {
	vi.stubEnv('LOMI_FAST_MODEL', 'fixture-fast');
	f.request.mockResolvedValue({
		data: {
			content: [
				{
					type: 'text',
					text: '{"updates":[{"section":"meals","text":"Ate breakfast and lunch."}]}'
				}
			]
		}
	});
	const result = await routeObservations({} as Tx, user, {
		clientId: 'person',
		message: 'Ate lunch.',
		current: { activities: '', meals: 'Ate breakfast.', mood: '', health: '' }
	});
	expect(result.fallback).toBe(false);
	expect(f.request.mock.calls[0][0].url).toContain('fixture-fast');
});
it('uses local suggestions without transmitting or reserving calls when no provider is configured', async () => {
	vi.stubEnv('LOMI_MODEL', '');
	expect(
		(
			await editSection({} as Tx, user, {
				clientId: 'person',
				section: 'meals',
				current: 'Ate lunch.',
				input: 'Drank water.'
			})
		).fallback
	).toBe(true);
	expect(f.request).not.toHaveBeenCalled();
	expect(f.record).not.toHaveBeenCalled();
});
