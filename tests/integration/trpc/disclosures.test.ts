// Accounting of disclosures (HIPAA 164.528; trpc-router.md client.disclosures,
// client.recordDisclosure, client.disclosureAccounting).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID(),
	STARTER = randomUUID(),
	OTHER = randomUUID();
const HOME = randomUUID(),
	STARTER_HOME = randomUUID(),
	OTHER_HOME = randomUUID();
const PERSON = randomUUID(),
	STARTER_PERSON = randomUUID(),
	OTHER_PERSON = randomUUID();
const [SUP, CARER, STARTER_SUP] = [randomUUID(), randomUUID(), randomUUID()];
const [ABUSE, FALL, OLD_FALL] = [randomUUID(), randomUUID(), randomUUID()];
const uid = (id: string) => `disc-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const day = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{
				id: AGENCY,
				name: 'Disc Test',
				slug: `disc-${AGENCY}`,
				subscription_tier: 'complete',
				timezone: 'UTC'
			},
			{
				id: STARTER,
				name: 'Disc Starter',
				slug: `disc-${STARTER}`,
				subscription_tier: 'starter',
				timezone: 'UTC'
			},
			{ id: OTHER, name: 'Disc Other', slug: `disc-${OTHER}`, subscription_tier: 'complete' }
		]);
		await t.insert(s.homes).values([
			{ id: HOME, agency_id: AGENCY, name: 'Oak' },
			{ id: STARTER_HOME, agency_id: STARTER, name: 'Elm' },
			{ id: OTHER_HOME, agency_id: OTHER, name: 'Pine' }
		]);
		await t.insert(s.profiles).values(
			(
				[
					[SUP, AGENCY, 'supervisor', 'Sam Supervisor', HOME],
					[CARER, AGENCY, 'caregiver', 'Cara Giver', HOME],
					[STARTER_SUP, STARTER, 'supervisor', 'Starter Supervisor', STARTER_HOME]
				] as const
			).map(([id, agency, role, name, home]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${uid(id)}@example.test`,
				name,
				role,
				home_ids: [home]
			}))
		);
		await t.insert(s.clients).values([
			{ id: PERSON, agency_id: AGENCY, home_id: HOME, name: 'Synthetic Person' },
			{ id: STARTER_PERSON, agency_id: STARTER, home_id: STARTER_HOME, name: 'Starter Person' },
			{ id: OTHER_PERSON, agency_id: OTHER, home_id: OTHER_HOME, name: 'Other Person' }
		]);
		// Reported to the state, told only the guardian (not accountable), and
		// reported to the state more than six years ago.
		await t.insert(s.incidents).values([
			{
				id: ABUSE,
				agency_id: AGENCY,
				client_id: PERSON,
				home_id: HOME,
				type: 'Suspected abuse or neglect',
				severity: 'High',
				description: 'Synthetic incident.',
				occurred_at: daysAgo(10),
				author_name: 'Cara Giver',
				notified_parties: ['Supervisor', 'State reporting system']
			},
			{
				id: FALL,
				agency_id: AGENCY,
				client_id: PERSON,
				home_id: HOME,
				type: 'Fall',
				description: 'Synthetic fall.',
				occurred_at: daysAgo(5),
				notified_parties: ['Supervisor', 'Family or guardian']
			},
			{
				id: OLD_FALL,
				agency_id: AGENCY,
				client_id: PERSON,
				home_id: HOME,
				type: 'Fall',
				description: 'Synthetic old fall.',
				occurred_at: daysAgo(7 * 365),
				notified_parties: ['State reporting system']
			}
		]);
		// When they were saved: the accounting takes the date the state was
		// marked as told, and who saved it, from the audit history.
		await t.insert(s.auditLog).values([
			{
				agency_id: AGENCY,
				table_name: 'incidents',
				record_id: ABUSE,
				action: 'INSERT',
				performed_by: CARER,
				new_values: { notified_parties: ['Supervisor', 'State reporting system'] },
				created_at: daysAgo(10)
			},
			{
				agency_id: AGENCY,
				table_name: 'incidents',
				record_id: OLD_FALL,
				action: 'INSERT',
				new_values: { notified_parties: ['State reporting system'] },
				created_at: daysAgo(7 * 365)
			}
		]);
	});
});

afterAll(closeDb);

it('supervisors record disclosures; the accounting adds state-reported incidents', async () => {
	const sup = await as(SUP);
	const entry = await sup.client.recordDisclosure({
		clientId: PERSON,
		disclosedOn: day(daysAgo(2)),
		recipient: 'County court',
		address: '1 Synthetic Plaza',
		description: 'Incident report and March MAR',
		purpose: 'court',
		detail: 'Subpoena 0000 (synthetic)'
	});
	expect(entry).toMatchObject({
		source: 'recorded',
		recordedBy: 'Sam Supervisor',
		purpose: 'court'
	});

	const accounting = await sup.client.disclosures({ clientId: PERSON });
	expect(accounting.person).toBe('Synthetic Person');
	expect(accounting.entries.map((e) => [e.source, e.recipient, e.purpose])).toEqual([
		['recorded', 'County court', 'court'],
		['incident', 'State incident reporting system', 'abuse_report']
	]);

	const file = await sup.client.disclosureAccounting({ clientId: PERSON });
	expect(file.content).toContain('"Accounting of disclosures","Synthetic Person"');
	expect(file.content).toContain('"County court","1 Synthetic Plaza"');
	expect(file.content).toContain('Cara Giver (incident report)');
	const audits = await withService((t) =>
		t
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, AGENCY), eq(s.auditLog.table_name, 'report_exports')))
	);
	expect(audits.map((a) => a.new_values)).toContainEqual(
		expect.objectContaining({ type: 'disclosure_accounting', clientId: PERSON, rows: 2 })
	);
});

it('is on every plan, and only for supervisors of the person’s agency', async () => {
	const starter = await as(STARTER_SUP);
	await starter.client.recordDisclosure({
		clientId: STARTER_PERSON,
		disclosedOn: day(new Date()),
		recipient: 'State surveyor',
		description: 'Care plan',
		purpose: 'health_oversight'
	});
	expect((await starter.client.disclosures({ clientId: STARTER_PERSON })).entries).toHaveLength(1);

	const carer = await as(CARER);
	await expect(carer.client.disclosures({ clientId: PERSON })).rejects.toThrow();
	await expect(
		carer.client.recordDisclosure({
			clientId: PERSON,
			disclosedOn: day(new Date()),
			recipient: 'Police',
			description: 'Incident report',
			purpose: 'law_enforcement'
		})
	).rejects.toThrow();

	const sup = await as(SUP);
	await expect(sup.client.disclosures({ clientId: OTHER_PERSON })).rejects.toThrow(
		'Person not found'
	);
	await expect(
		sup.client.recordDisclosure({
			clientId: PERSON,
			disclosedOn: day(daysAgo(-3)),
			recipient: 'Police',
			description: 'Incident report',
			purpose: 'law_enforcement'
		})
	).rejects.toThrow('future');
});

it('entries cannot be changed or deleted by app users', async () => {
	const { withUser } = await import('../../../src/lib/server/db');
	const user = await getCurrentUser(uid(SUP));
	await withUser(user!.claims, {}, async (t) => {
		const changed = await t
			.update(s.disclosures)
			.set({ recipient: 'Someone else' })
			.where(eq(s.disclosures.client_id, PERSON))
			.returning({ id: s.disclosures.id });
		expect(changed).toEqual([]);
		const removed = await t
			.delete(s.disclosures)
			.where(eq(s.disclosures.client_id, PERSON))
			.returning({ id: s.disclosures.id });
		expect(removed).toEqual([]);
	});
});

it('dates a state report by when the state was marked as told, and credits who did it', async () => {
	// The guardian-only fall is later reported to the state by a supervisor.
	await (await as(SUP)).incident.markNotified({ id: FALL, party: 'State reporting system' });
	const { entries } = await (await as(SUP)).client.disclosures({ clientId: PERSON });
	const fall = entries.find((e) => e.description === 'Incident report (Fall)');
	expect(fall).toMatchObject({
		date: day(new Date()),
		purpose: 'state_incident_report',
		recordedBy: 'Sam Supervisor',
		source: 'incident'
	});
});

it('refuses dates older than the accounting and purposes it does not know', async () => {
	await expect(
		(await as(SUP)).client.recordDisclosure({
			clientId: PERSON,
			disclosedOn: day(daysAgo(7 * 365)),
			recipient: 'Police',
			description: 'Incident report',
			purpose: 'law_enforcement'
		})
	).rejects.toThrow('last 6 years');
	await expect(
		withService((t) =>
			t.insert(s.disclosures).values({
				agency_id: AGENCY,
				client_id: PERSON,
				disclosed_on: day(new Date()),
				recipient: 'Synthetic',
				description: 'Synthetic',
				purpose: 'court_order'
			})
		)
	).rejects.toThrow();
	// The database's list is the domain's list.
	const { DISCLOSURE_PURPOSES } = await import('../../../src/lib/domain/disclosure');
	for (const purpose of DISCLOSURE_PURPOSES)
		await withService(async (t) => {
			await t.insert(s.disclosures).values({
				agency_id: OTHER,
				client_id: OTHER_PERSON,
				disclosed_on: day(new Date()),
				recipient: 'Synthetic',
				description: 'Synthetic',
				purpose
			});
		});
});
