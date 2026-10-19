import { describe, expect, it } from 'vitest';
import {
	parseTemplateSlots,
	templateFromWeek,
	templateToWeek
} from '../../../src/lib/domain/schedule-templates';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('schedule templates', () => {
	it('keeps assigned shifts by weekday and lays them onto another week', () => {
		const t = templateFromWeek(
			[
				{ day: '2026-10-19', shift: 'am', assignedTo: A },
				{ day: '2026-10-21', shift: 'on', assignedTo: B },
				{ day: '2026-10-22', shift: 'pm', assignedTo: null },
				{ day: '2026-10-26', shift: 'am', assignedTo: B }
			],
			'2026-10-19'
		);
		expect(t).toEqual([
			{ weekday: 0, shift: 'am', profileId: A },
			{ weekday: 2, shift: 'on', profileId: B }
		]);
		expect(templateToWeek(t, '2026-11-02')).toEqual([
			{ day: '2026-11-02', shift: 'am', assignedTo: A, status: 'filled' },
			{ day: '2026-11-04', shift: 'on', assignedTo: B, status: 'filled' }
		]);
	});

	it('drops malformed and duplicate stored slots', () => {
		expect(
			parseTemplateSlots([
				{ weekday: 0, shift: 'am', profileId: A },
				{ weekday: 0, shift: 'am', profileId: B },
				{ weekday: 7, shift: 'am', profileId: A },
				{ weekday: 1, shift: 'noon', profileId: A },
				{ weekday: 1, shift: 'pm', profileId: 'not-a-uuid' },
				null,
				'x'
			])
		).toEqual([{ weekday: 0, shift: 'am', profileId: A }]);
		expect(parseTemplateSlots('nope')).toEqual([]);
	});
});
