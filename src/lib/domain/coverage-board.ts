// Lomi's coverage posts on a home's message board (charting-ux.md §6,
// US-37), worded as in the MVP (mvp/src/app-core.js). Staff first names
// and the shift only: never the callout reason, which only supervisors see.
import { SHIFTS, type ShiftKey } from './shifts';
import { dayLabel } from './time';

const firstName = (name: string | null | undefined) =>
	name?.trim().split(/\s+/)[0] || 'A staff member';
const shiftName = (shift: ShiftKey) =>
	(SHIFTS.find((s) => s.key === shift)?.label ?? 'open').toLowerCase();

export type CoverageBoardEvent =
	| { kind: 'offered'; calledOutName?: string | null; eligible: number }
	| { kind: 'covered'; filledName: string | null }
	| { kind: 'unfilled' };

export function coverageBoardText(day: string, shift: ShiftKey, e: CoverageBoardEvent): string {
	const when = `the ${shiftName(shift)} shift on ${dayLabel(day)}`;
	if (e.kind === 'covered') return `${capital(when)} is covered by ${firstName(e.filledName)}.`;
	if (e.kind === 'unfilled') return `No one has taken ${when} yet, so a supervisor will fill it.`;
	const opening = e.calledOutName
		? `${firstName(e.calledOutName)} can’t make ${when}.`
		: `${capital(when)} is open.`;
	return `${opening} ${
		e.eligible
			? `I’ve offered it to ${e.eligible} eligible staff ${e.eligible === 1 ? 'member' : 'members'}.`
			: 'No one is eligible, so a supervisor will fill it.'
	}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
