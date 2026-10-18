// EVV (openapi.yaml /evv/*): clock records with GPS verification for state
// aggregators. Days are the agency's local days.
import { addDays, localInstant } from '../../../domain/index.ts';
import { withService } from '../../db';
import type { ApiCaller } from './keys';
import { countVisits, selectVisits, type VisitFilter } from './evv.queries';

type Row = Awaited<ReturnType<typeof selectVisits>>[number];

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function evvVisit(r: Row) {
	return {
		id: r.id,
		profile_id: r.profileId,
		profile_name: r.profileName,
		home_id: r.homeId,
		home_name: r.homeName,
		home_address: r.homeAddress ?? null,
		clock_in_at: r.clockInAt.toISOString(),
		clock_out_at: iso(r.clockOutAt),
		verified: r.verified,
		manual_override: r.manualOverride,
		visitor_lat: r.lat,
		visitor_lng: r.lng,
		distance_meters: r.distance === null ? null : Math.round(r.distance),
		home_lat: r.homeLat,
		home_lng: r.homeLng,
		home_radius: r.homeRadius,
		duration_minutes: r.clockOutAt
			? Math.round(((r.clockOutAt.getTime() - r.clockInAt.getTime()) / 60_000) * 10) / 10
			: null
	};
}

function period(caller: ApiCaller, from: string, to: string) {
	return {
		start: localInstant(from, '00:00', caller.timeZone),
		end: localInstant(addDays(to, 1), '00:00', caller.timeZone)
	};
}

export function listEvvVisits(
	caller: ApiCaller,
	q: {
		from: string;
		to: string;
		homeId: string | null;
		profileId: string | null;
		verifiedOnly: boolean;
		limit: number;
		offset: number;
	}
) {
	const f: VisitFilter = {
		agencyId: caller.agencyId,
		...period(caller, q.from, q.to),
		homeId: q.homeId,
		profileId: q.profileId,
		verifiedOnly: q.verifiedOnly
	};
	return withService(async (tx) => {
		const rows = await selectVisits(tx, f, q.limit, q.offset);
		const total = await countVisits(tx, f);
		return {
			data: rows.map(evvVisit),
			pagination: { limit: q.limit, offset: q.offset, total }
		};
	});
}

export function getEvvVisit(caller: ApiCaller, id: string) {
	return withService(async (tx) => {
		const [row] = await selectVisits(tx, { agencyId: caller.agencyId, id }, 1, 0);
		return row ? evvVisit(row) : null;
	});
}

export function evvSummary(
	caller: ApiCaller,
	q: { from: string; to: string; homeId: string | null }
) {
	const f: VisitFilter = {
		agencyId: caller.agencyId,
		...period(caller, q.from, q.to),
		homeId: q.homeId
	};
	return withService(async (tx) => {
		const total = await countVisits(tx, f);
		const verified = await countVisits(tx, f, true);
		return {
			total_visits: total,
			verified_count: verified,
			unverified_count: total - verified,
			verification_rate: total ? Math.round((verified / total) * 10000) / 10000 : 0,
			period: { from: q.from, to: q.to }
		};
	});
}
