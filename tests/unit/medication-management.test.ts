import { describe, expect, it } from 'vitest';
import {
	NewMedication,
	MedicationChanges
} from '../../src/lib/server/services/medication/management';
const id = '12345678-1234-4234-8234-123456789abc';
describe('medication management input boundaries', () => {
	it('requires exact valid clock times and bounds the raw slot count', () => {
		for (const time of ['24:00', '12:60', '8:00', '08:00:00', '8am', 'junk'])
			expect(
				NewMedication.safeParse({ clientId: id, name: 'Synthetic', scheduledTimes: [time] }).success
			).toBe(false);
		expect(
			NewMedication.safeParse({
				clientId: id,
				name: 'Synthetic',
				scheduledTimes: Array(25).fill('08:00')
			}).success
		).toBe(false);
		expect(
			NewMedication.parse({
				clientId: id,
				name: ' Synthetic ',
				scheduledTimes: ['20:00', '08:00', '08:00']
			})
		).toMatchObject({ name: 'Synthetic', scheduledTimes: ['08:00', '20:00'] });
	});
	it('rejects empty/no-op updates, oversized fields and protected/unknown columns', () => {
		for (const input of [
			{ id },
			{ id, name: undefined },
			{ id, name: ' ' },
			{ id, notes: 'x'.repeat(4001) },
			{ id, clientId: id },
			{ id, stoppedAt: new Date() },
			{ id, startedAt: new Date() },
			{ id, home_id: id }
		])
			expect(MedicationChanges.safeParse(input).success).toBe(false);
		expect(NewMedication.safeParse({ clientId: id, name: 'x'.repeat(201) }).success).toBe(false);
		expect(
			NewMedication.safeParse({ clientId: id, name: 'Synthetic', startedAt: null }).success
		).toBe(false);
		expect(MedicationChanges.parse({ id, dose: null, notes: '' })).toMatchObject({
			dose: null,
			notes: ''
		});
	});
});
