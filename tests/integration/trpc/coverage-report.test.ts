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
	foreignAgency = randomUUID();
const home = randomUUID(),
	otherHome = randomUUID(),
	foreignHome = randomUUID();
const admin = randomUUID(),
	supervisor = randomUUID(),
	caregiver = randomUUID();
const requestId = randomUUID(),
	candidateId = randomUUID(),
	ownNotification = randomUUID(),
	otherNotification = randomUUID();
const uid = (id: string) => `coverage-report-${id}`;
const createCaller = createCallerFactory(appRouter);
const as = async (id: string) =>
	createCaller({
		user: await getCurrentUser(uid(id)),
		request: { ip: '127.0.0.1', user_agent: 'synthetic-coverage-export' }
	});
const input = (profileId: string) => ({
	homeId: home,
	expectedProfileId: profileId,
	fromDay: '2026-03-08',
	toDay: '2026-03-08',
	format: 'json' as const
});

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{
				id: agency,
				name: 'Synthetic coverage export',
				slug: uid(agency),
				subscription_tier: 'complete',
				timezone: 'America/New_York'
			},
			{
				id: foreignAgency,
				name: 'Foreign coverage export',
				slug: uid(foreignAgency),
				subscription_tier: 'complete'
			}
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Export home' },
			{ id: otherHome, agency_id: agency, name: 'Unassigned home' },
			{ id: foreignHome, agency_id: foreignAgency, name: 'Foreign home' }
		]);
		await tx.insert(s.profiles).values([
			{
				id: admin,
				agency_id: agency,
				auth_uid: uid(admin),
				name: 'Export admin',
				role: 'admin',
				email: `${admin}@example.test`,
				home_ids: [home]
			},
			{
				id: supervisor,
				agency_id: agency,
				auth_uid: uid(supervisor),
				name: 'Export supervisor',
				role: 'supervisor',
				email: `${supervisor}@example.test`,
				home_ids: [home]
			},
			{
				id: caregiver,
				agency_id: agency,
				auth_uid: uid(caregiver),
				name: '=Candidate label',
				role: 'caregiver',
				email: `${caregiver}@example.test`,
				home_ids: [home],
				phone: '+12025550155'
			}
		]);
		await tx.insert(s.coverageRequests).values([
			{
				id: requestId,
				agency_id: agency,
				home_id: home,
				day: '2026-03-08',
				shift: 'on',
				called_out_by: caregiver,
				reason: '=Synthetic callout marker',
				status: 'filled',
				filled_by: caregiver,
				filled_at: new Date('2026-03-08T12:00:00Z')
			},
			{
				agency_id: agency,
				home_id: home,
				day: '2026-03-09',
				shift: 'am',
				reason: 'Outside period marker'
			},
			{
				agency_id: agency,
				home_id: otherHome,
				day: '2026-03-08',
				shift: 'am',
				reason: 'Other home marker'
			},
			{
				agency_id: foreignAgency,
				home_id: foreignHome,
				day: '2026-03-08',
				shift: 'am',
				reason: 'Foreign marker'
			}
		]);
		await tx.insert(s.coverageCandidates).values([
			{
				id: candidateId,
				agency_id: agency,
				coverage_request_id: requestId,
				profile_id: caregiver,
				eligible: true,
				reply: 'accepted',
				replied_at: new Date('2026-03-15T00:00:00Z')
			},
			{
				agency_id: agency,
				coverage_request_id: requestId,
				profile_id: supervisor,
				eligible: false,
				eligibility_reason: 'not_trained'
			}
		]);
		await tx.insert(s.coverageSteps).values({
			agency_id: agency,
			home_id: home,
			coverage_request_id: requestId,
			description: 'Synthetic recorded activity'
		});
		await tx.insert(s.notifications).values([
			{
				id: ownNotification,
				agency_id: agency,
				profile_id: supervisor,
				type: 'coverage_offer',
				channel: 'push',
				title: 'Private title excluded',
				body: 'Private body excluded',
				reference_id: requestId,
				reference_type: 'coverage_requests'
			},
			{
				id: otherNotification,
				agency_id: agency,
				profile_id: caregiver,
				type: 'coverage_offer',
				channel: 'sms',
				title: 'Private title excluded',
				reference_id: requestId,
				reference_type: 'coverage_requests',
				status: 'sent',
				sent_at: new Date('2026-03-08T10:00:00Z'),
				provider_message_id: 'synthetic-provider-id-excluded'
			},
			{
				agency_id: agency,
				profile_id: caregiver,
				type: 'other',
				channel: 'sms',
				title: 'Wrong type excluded',
				reference_id: requestId,
				reference_type: 'coverage_requests'
			}
		]);
		await tx.insert(s.coverageOfferEvidence).values([
			{
				agency_id: agency,
				home_id: home,
				coverage_request_id: requestId,
				notification_id: otherNotification,
				recipient_profile_id: caregiver,
				channel: 'sms',
				event: 'queued',
				occurred_at: new Date('2026-03-08T09:59:00Z')
			},
			{
				agency_id: agency,
				home_id: home,
				coverage_request_id: requestId,
				notification_id: otherNotification,
				recipient_profile_id: caregiver,
				channel: 'sms',
				event: 'provider_accepted',
				occurred_at: new Date('2026-03-08T10:00:00Z')
			}
		]);
	});
});
afterAll(closeDb);

it('exports scoped current facts, preserves notification RLS and audits only scope metadata', async () => {
	const sup = await as(supervisor);
	const file = await sup.report.exportCoverage(input(supervisor));
	const report = JSON.parse(file.content);
	expect(report.version).toBe(2);
	expect(report.notificationVisibility).toBe('own_recipient_only');
	expect(report.offerEvidenceVisibility).toBe('selected_home_prospective');
	expect(report.timeZone).toBe('America/New_York');
	expect(report.rows.filter((r: { kind: string }) => r.kind === 'request')).toMatchObject([
		{ id: requestId, shift: 'on', filledBy: caregiver, reason: '=Synthetic callout marker' }
	]);
	expect(report.rows.find((r: { id: string }) => r.id === candidateId)).toMatchObject({
		eligible: true,
		reply: 'accepted',
		repliedAt: '2026-03-15T00:00:00.000Z'
	});
	expect(
		report.rows
			.filter((r: { kind: string }) => r.kind === 'notification')
			.map((r: { id: string }) => r.id)
	).toEqual([ownNotification]);
	expect(
		report.rows
			.filter((r: { kind: string }) => r.kind === 'offer_evidence')
			.map((r: { event: string }) => r.event)
	).toEqual(['queued', 'provider_accepted']);
	expect(report.rows.filter((r: { kind: string }) => r.kind === 'offer_evidence')).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				staffId: caregiver,
				staffName: '=Candidate label',
				channel: 'sms'
			})
		])
	);
	expect(report.evidenceLimits).toContain('Eligibility is not proof an offer was sent');
	expect(report.evidenceLimits).toContain('provider_accepted is not device delivery');
	expect(report.evidenceLimits).toContain('not a snapshot at the period end');
	for (const marker of [
		'Outside period marker',
		'Other home marker',
		'Foreign marker',
		'+12025550155',
		'Private title excluded',
		'Private body excluded',
		'synthetic-provider-id-excluded',
		'Wrong type excluded'
	])
		expect(file.content).not.toContain(marker);
	const adminFile = await (await as(admin)).report.exportCoverage(input(admin));
	const adminReport = JSON.parse(adminFile.content);
	expect(adminReport.notificationVisibility).toBe('agency');
	expect(
		adminReport.rows
			.filter((r: { kind: string }) => r.kind === 'notification')
			.map((r: { id: string }) => r.id)
			.sort()
	).toEqual([ownNotification, otherNotification].sort());
	expect(adminFile.content).not.toContain('synthetic-provider-id-excluded');
	const csv = await sup.report.exportCoverage({ ...input(supervisor), format: 'csv' });
	expect(csv.filename).toBe('guad-coverage.csv');
	expect(csv.content).toContain('"\'=Synthetic callout marker"');
	expect(csv.content).toContain('"\'=Candidate label"');
	await withService(async (tx) => {
		const audits = await tx
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'report_exports')));
		const audit = audits.find((r) => (r.new_values as { format?: string })?.format === 'csv')!;
		expect(audit.new_values).toMatchObject({
			type: 'coverage',
			format: 'csv',
			rows: report.rows.length,
			homeId: home,
			requestIds: [requestId],
			notificationVisibility: 'own_recipient_only',
			offerEvidenceVisibility: 'selected_home_prospective'
		});
		expect(JSON.stringify(audit.new_values)).not.toContain('Synthetic callout marker');
		expect(
			await tx.select().from(s.reportJobs).where(eq(s.reportJobs.agency_id, agency))
		).toHaveLength(0);
	});
});

it('rejects stale home, role, active-account and plan access without broadening RLS', async () => {
	const sup = await as(supervisor),
		boss = await as(admin);
	await expect((await as(caregiver)).report.exportCoverage(input(caregiver))).rejects.toMatchObject(
		{ code: 'FORBIDDEN' }
	);
	await expect(
		sup.report.exportCoverage({ ...input(supervisor), expectedProfileId: admin })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		sup.report.exportCoverage({ ...input(supervisor), homeId: otherHome })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		boss.report.exportCoverage({ ...input(admin), homeId: foreignHome })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	expect(
		JSON.parse((await boss.report.exportCoverage({ ...input(admin), homeId: otherHome })).content)
			.rows
	).toHaveLength(1);
	await withService((tx) =>
		tx.update(s.profiles).set({ home_ids: [] }).where(eq(s.profiles.id, supervisor))
	);
	await expect(sup.report.exportCoverage(input(supervisor))).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ home_ids: [home] })
			.where(eq(s.profiles.id, supervisor))
	);
	await withService((tx) =>
		tx.update(s.profiles).set({ role: 'supervisor' }).where(eq(s.profiles.id, admin))
	);
	await expect(boss.report.exportCoverage(input(admin))).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await withService((tx) =>
		tx.update(s.profiles).set({ role: 'admin' }).where(eq(s.profiles.id, admin))
	);
	await withService((tx) =>
		tx.update(s.profiles).set({ active: false }).where(eq(s.profiles.id, supervisor))
	);
	await expect(sup.report.exportCoverage(input(supervisor))).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await withService((tx) =>
		tx.update(s.profiles).set({ active: true }).where(eq(s.profiles.id, supervisor))
	);
	await withService((tx) =>
		tx.update(s.agencies).set({ subscription_tier: 'starter' }).where(eq(s.agencies.id, agency))
	);
	await expect(sup.report.exportCoverage(input(supervisor))).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await withService((tx) =>
		tx.update(s.agencies).set({ subscription_tier: 'complete' }).where(eq(s.agencies.id, agency))
	);
});

it('allows Starter coverage CSV under fresh scope checks while rejecting full reports and JSON', async () => {
	await withService((tx) =>
		tx.update(s.agencies).set({ subscription_tier: 'starter' }).where(eq(s.agencies.id, agency))
	);
	try {
		// Build a new real caller so this checks middleware as well as fresh service entitlements.
		const sup = await as(supervisor);
		const csv = await sup.report.exportCoverage({ ...input(supervisor), format: 'csv' });
		expect(csv.filename).toBe('guad-coverage.csv');
		expect(csv.contentType).toBe('text/csv;charset=utf-8');
		expect(csv.content).toContain('Synthetic callout marker');
		expect(csv.content).toContain('selected_home_prospective');
		expect(csv.content).not.toContain('+12025550155');
		await expect(sup.report.exportCoverage(input(supervisor))).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		await expect(
			sup.report.exportCoverage({ ...input(supervisor), format: 'csv', homeId: otherHome })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(
			sup.report.exportCoverage({ ...input(supervisor), format: 'csv', expectedProfileId: admin })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(
			sup.report.exportClinical({
				type: 'notes',
				homeId: home,
				fromDay: '2026-03-08',
				toDay: '2026-03-08',
				format: 'csv'
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await withService((tx) =>
			tx.update(s.profiles).set({ home_ids: [] }).where(eq(s.profiles.id, supervisor))
		);
		await expect(
			sup.report.exportCoverage({ ...input(supervisor), format: 'csv' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
	} finally {
		await withService(async (tx) => {
			await tx
				.update(s.profiles)
				.set({ home_ids: [home] })
				.where(eq(s.profiles.id, supervisor));
			await tx
				.update(s.agencies)
				.set({ subscription_tier: 'complete' })
				.where(eq(s.agencies.id, agency));
		});
	}
});

it('rejects invalid/overlong periods, unknown input fields, excess source rows and oversized output', async () => {
	const sup = await as(supervisor);
	for (const p of [
		{ ...input(supervisor), fromDay: '2026-01-01', toDay: '2026-04-04' },
		{ ...input(supervisor), fromDay: '2026-03-09', toDay: '2026-03-08' },
		{ ...input(supervisor), fromDay: '2026-02-30' },
		{ ...input(supervisor), agencyId: foreignAgency }
	])
		await expect(sup.report.exportCoverage(p)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	const large = randomUUID(),
		many = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.coverageRequests).values([
			{
				id: large,
				agency_id: agency,
				home_id: home,
				day: '2026-04-01',
				shift: 'am',
				reason: 'x'.repeat(8 * 1024 * 1024)
			},
			{ id: many, agency_id: agency, home_id: home, day: '2026-04-02', shift: 'am' }
		]);
		await tx.insert(s.coverageSteps).values(
			Array.from({ length: 1000 }, () => ({
				agency_id: agency,
				home_id: home,
				coverage_request_id: many,
				description: 'Synthetic bounded activity'
			}))
		);
	});
	await expect(
		sup.report.exportCoverage({ ...input(supervisor), fromDay: '2026-04-01', toDay: '2026-04-01' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('8 MB') });
	await expect(
		sup.report.exportCoverage({ ...input(supervisor), fromDay: '2026-04-02', toDay: '2026-04-02' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('1,000') });
});
