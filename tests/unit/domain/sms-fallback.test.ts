import { describe, expect, it } from 'vitest';
import { needsPushSmsFallback, needsSmsPushFallback } from '../../../src/lib/domain/notifications';
import { smsFallbackId } from '../../../src/lib/server/services/notification/sms-fallback-id';
it('limits immediate fallback to an unacknowledged terminal urgent failure with allowed push', () => {
	const failed = {
		priority: 1,
		status: 'failed',
		active: true,
		acknowledged: false,
		pushAllowed: true
	};
	expect(needsSmsPushFallback(failed)).toBe(true);
	for (const patch of [
		{ priority: 2 },
		{ priority: 3 },
		{ status: 'pending' },
		{ status: 'sent' },
		{ active: false },
		{ acknowledged: true },
		{ pushAllowed: false }
	])
		expect(needsSmsPushFallback({ ...failed, ...patch })).toBe(false);
});
it('gives each source SMS a stable UUID without changing the original event reference', () => {
	const source = '50b81824-b362-48fb-80ec-3b1a7c5d6b8d';
	expect(smsFallbackId(source)).toBe(smsFallbackId(source));
	expect(smsFallbackId(source)).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
	);
	expect(smsFallbackId(source)).not.toBe(source);
	expect(smsFallbackId('50b81824-b362-48fb-80ec-3b1a7c5d6b8e')).not.toBe(smsFallbackId(source));
});

describe('needsPushSmsFallback', () => {
	const failed = {
		type: 'health_alert',
		status: 'failed',
		active: true,
		acknowledged: false,
		hasPhone: true,
		smsPreference: undefined
	};
	it('texts a failed mandatory push to an active person with a phone', () => {
		expect(needsPushSmsFallback(failed)).toBe(true);
		expect(needsPushSmsFallback({ ...failed, smsPreference: true })).toBe(true);
	});
	it('never when texts are off for the type (STOP), or for optional alerts', () => {
		expect(needsPushSmsFallback({ ...failed, smsPreference: false })).toBe(false);
		expect(needsPushSmsFallback({ ...failed, type: 'shift_reminder' })).toBe(false);
		expect(needsPushSmsFallback({ ...failed, hasPhone: false })).toBe(false);
		expect(needsPushSmsFallback({ ...failed, acknowledged: true })).toBe(false);
		expect(needsPushSmsFallback({ ...failed, active: false })).toBe(false);
		expect(needsPushSmsFallback({ ...failed, status: 'sent' })).toBe(false);
	});
});
