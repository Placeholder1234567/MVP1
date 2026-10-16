import { afterEach, describe, expect, it, vi } from 'vitest';
import { mfaRequirement, requiredRolesFromSettings } from '../../../src/lib/domain';
import { mfaEnforced } from '../../../src/lib/server/identity';

const now = new Date('2026-10-15T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('MFA policy (security.md)', () => {
	it('requires it for admins at once', () => {
		expect(mfaRequirement('admin', daysAgo(0), now)).toEqual({ kind: 'required' });
	});

	it('gives supervisors a 30-day grace period from account creation', () => {
		expect(mfaRequirement('supervisor', daysAgo(0), now)).toEqual({ kind: 'grace', daysLeft: 30 });
		expect(mfaRequirement('supervisor', daysAgo(29), now)).toEqual({ kind: 'grace', daysLeft: 1 });
		expect(mfaRequirement('supervisor', daysAgo(30), now)).toEqual({ kind: 'required' });
	});

	it('leaves caregivers optional unless the agency requires it', () => {
		expect(mfaRequirement('caregiver', daysAgo(400), now)).toEqual({ kind: 'optional' });
		expect(mfaRequirement('caregiver', daysAgo(0), now, ['caregiver'])).toEqual({
			kind: 'required'
		});
		expect(mfaRequirement('supervisor', daysAgo(0), now, ['supervisor'])).toEqual({
			kind: 'required'
		});
	});

	it('reads mfa_required_roles from agency settings, ignoring anything malformed', () => {
		expect(requiredRolesFromSettings({ mfa_required_roles: ['caregiver', 3] })).toEqual([
			'caregiver'
		]);
		expect(requiredRolesFromSettings({ mfa_required_roles: 'caregiver' })).toEqual([]);
		expect(requiredRolesFromSettings(null)).toEqual([]);
	});
});

describe('enforcement switch', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('is on in production, off with the Auth emulator or MFA_ENFORCE=off', () => {
		vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '');
		vi.stubEnv('MFA_ENFORCE', '');
		expect(mfaEnforced()).toBe(true);
		vi.stubEnv('MFA_ENFORCE', 'off');
		expect(mfaEnforced()).toBe(false);
		vi.stubEnv('MFA_ENFORCE', '');
		vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
		expect(mfaEnforced()).toBe(false);
	});
});
