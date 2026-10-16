import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	otherAgency = randomUUID();
const home = randomUUID(),
	otherHome = randomUUID(),
	foreignHome = randomUUID();
const person = randomUUID(),
	otherPerson = randomUUID(),
	foreignPerson = randomUUID();
const supervisor = randomUUID(),
	caregiver = randomUUID(),
	medication = randomUUID();
const signed = randomUUID(),
	approved = randomUUID(),
	draft = randomUUID(),
	returned = randomUUID();
const original = randomUUID(),
	amendment = randomUUID(),
	conflict = randomUUID();
const uid = (id: string) => `report-${id}`;
const createCaller = createCallerFactory(appRouter);
const as = async (id: string) =>
	createCaller({
		user: await getCurrentUser(uid(id)),
		request: { ip: '127.0.0.1', user_agent: 'synthetic-report-test' }
	});
const input = {
	homeId: home,
	clientId: person,
	fromDay: '2026-03-08',
	toDay: '2026-03-08',
	format: 'json' as const
};
beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{
				id: agency,
				slug: `report-${agency}`,
				name: 'Synthetic report agency',
				subscription_tier: 'complete',
				timezone: 'America/New_York'
			},
			{
				id: otherAgency,
				slug: `report-${otherAgency}`,
				name: 'Foreign synthetic agency',
				subscription_tier: 'complete'
			}
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Report home' },
			{ id: otherHome, agency_id: agency, name: 'Other report home' },
			{ id: foreignHome, agency_id: otherAgency, name: 'Foreign home' }
		]);
		await tx.insert(s.profiles).values([
			{
				id: supervisor,
				agency_id: agency,
				auth_uid: uid(supervisor),
				email: `${supervisor}@example.test`,
				name: 'Report supervisor',
				role: 'supervisor',
				home_ids: [home]
			},
			{
				id: caregiver,
				agency_id: agency,
				auth_uid: uid(caregiver),
				email: `${caregiver}@example.test`,
				name: 'Report caregiver',
				role: 'caregiver',
				home_ids: [home]
			}
		]);
		await tx.insert(s.clients).values([
			{
				id: person,
				agency_id: agency,
				home_id: home,
				name: '=Synthetic person',
				dob: '1980-01-01'
			},
			{ id: otherPerson, agency_id: agency, home_id: otherHome, name: 'Other home person' },
			{ id: foreignPerson, agency_id: otherAgency, home_id: foreignHome, name: 'Foreign person' }
		]);
		await tx.insert(s.notes).values([
			...[
				{ id: signed, status: 'submitted' as const },
				{ id: approved, status: 'approved' as const },
				{ id: draft, status: 'draft' as const },
				{ id: returned, status: 'returned' as const }
			].map((r) => ({
				...r,
				agency_id: agency,
				client_id: person,
				home_id: home,
				author_id: caregiver,
				author_name: 'Record author',
				day: '2026-03-08',
				shift: 'on' as const,
				type: 'shift' as const,
				content: { narrative: 'ሰላም <script>unsafe()</script>' }
			})),
			{
				agency_id: agency,
				client_id: person,
				home_id: home,
				day: '2026-03-09',
				shift: 'am',
				type: 'shift',
				status: 'submitted'
			},
			{
				agency_id: agency,
				client_id: otherPerson,
				home_id: otherHome,
				day: '2026-03-08',
				shift: 'am',
				type: 'shift',
				status: 'submitted'
			},
			{
				agency_id: otherAgency,
				client_id: foreignPerson,
				home_id: foreignHome,
				day: '2026-03-08',
				shift: 'am',
				type: 'shift',
				status: 'submitted'
			}
		]);
		await tx
			.insert(s.noteHistory)
			.values({
				agency_id: agency,
				note_id: signed,
				action: 'signed',
				by_name: 'Record author',
				occurred_at: new Date('2026-03-09T03:00Z')
			});
		await tx
			.insert(s.medications)
			.values({
				id: medication,
				agency_id: agency,
				client_id: person,
				name: 'Current medication label deliberately omitted',
				dose: 'Changed dose'
			});
		await tx
			.insert(s.marRecords)
			.values({
				id: original,
				agency_id: agency,
				client_id: person,
				medication_id: medication,
				day: '2026-03-08',
				scheduled_time: '08:00',
				status: 'given',
				recorded_by: caregiver,
				recorded_by_name: 'Record author'
			});
		await tx.insert(s.marRecords).values([
			{
				id: amendment,
				agency_id: agency,
				client_id: person,
				medication_id: medication,
				day: '2026-03-08',
				scheduled_time: '08:00',
				status: 'held',
				amends_id: original
			},
			{
				id: conflict,
				agency_id: agency,
				client_id: person,
				medication_id: medication,
				day: '2026-03-08',
				scheduled_time: '08:00',
				status: 'given',
				conflict_with: original
			}
		]);
		await tx
			.insert(s.healthEntries)
			.values(
				[
					'2026-03-08T04:59:59Z',
					'2026-03-08T05:00:00Z',
					'2026-03-09T03:59:59Z',
					'2026-03-09T04:00:00Z'
				].map((at) => ({
					agency_id: agency,
					client_id: person,
					kind: 'vitals' as const,
					data: { temp: 98.6 },
					recorded_at: new Date(at),
					recorded_by: caregiver
				}))
			);
		await tx.insert(s.incidents).values([
			{
				agency_id: agency,
				client_id: person,
				type: 'Other',
				description: 'At start boundary',
				occurred_at: new Date('2026-03-08T05:00Z'),
				witnesses: 'Excluded witness details',
				location: 'Excluded precise location'
			},
			{
				agency_id: agency,
				client_id: person,
				type: 'Other',
				description: 'At exclusive end',
				occurred_at: new Date('2026-03-09T04:00Z')
			},
			{ agency_id: agency, client_id: person, type: 'Other', description: 'Undated' }
		]);
		await tx.insert(s.attendance).values([
			{
				agency_id: agency,
				client_id: person,
				day: '2026-03-08',
				services: ['Day program'],
				recorded_by: caregiver
			},
			{
				agency_id: agency,
				client_id: person,
				day: '2026-03-09',
				services: ['Day program'],
				recorded_by: caregiver
			}
		]);
	});
});
afterAll(closeDb);

it('exports only signed/approved notes with available signature events and approved-only filtering', async () => {
	const caller = await as(supervisor);
	const report = JSON.parse(
		(await caller.report.exportClinical({ ...input, type: 'notes' })).content
	);
	expect(report.rows.map((r: { id: string }) => r.id).sort()).toEqual([signed, approved].sort());
	expect(report.rows.find((r: { id: string }) => r.id === signed).signatureEvents).toContainEqual({
		action: 'signed',
		byName: 'Record author',
		occurredAt: '2026-03-09T03:00:00.000Z'
	});
	expect(report.rows[0].shift).toBe('on');
	expect(JSON.stringify(report)).not.toContain('1980-01-01');
	const filtered = JSON.parse(
		(await caller.report.exportClinical({ ...input, type: 'notes', approvedOnly: true })).content
	);
	expect(filtered.rows.map((r: { id: string }) => r.id)).toEqual([approved]);
	const html = await caller.report.exportClinical({ ...input, type: 'notes', format: 'html' });
	expect(html.content).toContain('&lt;script&gt;unsafe()&lt;/script&gt;');
	expect(html.content).toContain('ሰላም');
	const csv = await caller.report.exportClinical({ ...input, type: 'notes', format: 'csv' });
	expect(csv.content).toContain('"\'=Synthetic person"');
});

it('exports all MAR amendments/conflicts, bounded health timestamps, incident and attendance records', async () => {
	const caller = await as(supervisor);
	const report = async (type: 'mar' | 'health' | 'incidents' | 'attendance') =>
		JSON.parse((await caller.report.exportClinical({ ...input, type })).content);
	const mar = await report('mar');
	expect(mar.rows).toHaveLength(3);
	expect(mar.rows.find((r: { id: string }) => r.id === amendment).amendsId).toBe(original);
	expect(mar.rows.find((r: { id: string }) => r.id === conflict).conflictWith).toBe(original);
	expect(JSON.stringify(mar)).not.toContain('Changed dose');
	const health = await report('health');
	expect(health.rows.map((r: { recordedAt: string }) => r.recordedAt)).toEqual([
		'2026-03-08T05:00:00.000Z',
		'2026-03-09T03:59:59.000Z'
	]);
	const incidents = await report('incidents');
	expect(incidents.rows).toHaveLength(1);
	expect(JSON.stringify(incidents)).not.toContain('Excluded');
	expect((await report('attendance')).rows).toHaveLength(1);
	const audit = await withService((tx) =>
		tx
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'report_exports')))
	);
	expect(audit.length).toBeGreaterThanOrEqual(4);
	expect(audit.every((r) => r.performed_by === supervisor && r.ip_address === '127.0.0.1')).toBe(
		true
	);
});

it('enforces caregiver, feature, client/home and tenant boundaries before producing records', async () => {
	await expect(
		(await as(caregiver)).report.exportClinical({ ...input, type: 'notes' })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	const caller = await as(supervisor);
	for (const scope of [
		{ homeId: foreignHome, clientId: foreignPerson },
		{ homeId: home, clientId: foreignPerson },
		{ homeId: home, clientId: otherPerson }
	])
		await expect(
			caller.report.exportClinical({ ...input, ...scope, type: 'notes' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	const all = await caller.report.exportClinical({ ...input, clientId: undefined, type: 'notes' });
	expect(all.content).not.toContain('Foreign person');
	expect(all.content).not.toContain('Other home person');
	const current = (await getCurrentUser(uid(supervisor)))!;
	for (const features of [['reports_basic', 'charting'], ['reports'], ['charting']] as const) {
		const denied = createCaller({ user: { ...current, features: [...features] }, request: {} });
		await expect(denied.report.exportClinical({ ...input, type: 'notes' })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	}
	await expect(
		caller.report.exportClinical({
			...input,
			fromDay: '2026-01-01',
			toDay: '2026-12-31',
			type: 'notes'
		})
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
