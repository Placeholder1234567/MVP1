/**
 * Guad — HIPAA-compliant Postgres schema (Drizzle ORM)
 *
 * Every table carries agency_id for tenant isolation and RLS (47 tables).
 * All timestamps are stored WITH time zone.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  date,
  time,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', [
  'caregiver',
  'supervisor',
  'admin',
]);

export const noteStatusEnum = pgEnum('note_status', [
  'draft',
  'submitted',
  'approved',
  'returned',
]);

export const noteTypeEnum = pgEnum('note_type', ['shift', 'behavior']);

export const incidentTypeEnum = pgEnum('incident_type', [
  'Seizure',
  'Medication error',
  'Injury',
  'Fall',
  'Left without staff',
  'Behavior with harm',
  'Property damage',
  // Critical incidents every state must track (42 CFR 441.302(a)(6)); kept
  // separate so they reach the state report and the mandated-reporter notice.
  'Suspected abuse or neglect',
  'Suspected exploitation',
  'Death',
  'Other',
]);

export const incidentSeverityEnum = pgEnum('incident_severity', [
  'Low',
  'Medium',
  'High',
]);

export const marStatusEnum = pgEnum('mar_status', [
  'given',
  'refused',
  'held',
]);

export const healthEntryKindEnum = pgEnum('health_entry_kind', [
  'vitals',
  'seizure',
  'illness',
  'appointment',
  'bowel',
]);

export const coverageStatusEnum = pgEnum('coverage_status', [
  'searching',
  'filled',
  'unfilled',
]);

export const shiftKeyEnum = pgEnum('shift_key', ['am', 'pm', 'on']);

export const chartingPresetEnum = pgEnum('charting_preset', [
  'therap',
  'default',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'INSERT',
  'UPDATE',
  'DELETE',
]);

export const incidentStatusEnum = pgEnum('incident_status', [
  'open',
  'reviewed',
  'closed',
]);

export const slotStatusEnum = pgEnum('slot_status', [
  'open',
  'filled',
  'filling',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'sent',
  'read',
  'failed',
  'escalated',
  'escalation_exhausted',
  'rate_limited',
]);

export const coverageOfferEvidenceEventEnum = pgEnum('coverage_offer_evidence_event', [
  'queued',
  'provider_accepted',
  'delivery_reported',
  'failed',
  'suppressed',
  'rate_limited',
]);

export const referralStatusEnum = pgEnum('referral_status', [
  'inquiry',
  'touring',
  'accepted',
  'waitlist',
  'declined',
  'placed',
]);

export const roomStatusEnum = pgEnum('room_status', [
  'available',
  'occupied',
  'reserved',
]);

export const candidateReplyEnum = pgEnum('candidate_reply', [
  'pending',
  'accepted',
  'declined',
]);

export const medHistoryActionEnum = pgEnum('med_history_action', [
  'added',
  'updated',
  'stopped',
]);

// ─── 1. agencies ─────────────────────────────────────────────────────────────

export const agencies = pgTable(
  'agencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    charting_preset: chartingPresetEnum('charting_preset')
      .notNull()
      .default('default'),
    settings: jsonb('settings').default({}),
    subscription_tier: text('subscription_tier').notNull().default('starter'),
    enabled_features: text('enabled_features').array().default([]),
    timezone: text('timezone').notNull().default('America/New_York'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('agencies_slug_idx').on(t.slug),
  ],
);

// ─── 2. profiles ─────────────────────────────────────────────────────────────

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    auth_uid: text('auth_uid').notNull(), // Identity Platform (Firebase Auth) UID
    email: text('email').notNull(),
    phone: text('phone'),
    name: text('name').notNull(),
    initials: text('initials'),
    role: userRoleEnum('role').notNull().default('caregiver'),
    home_ids: uuid('home_ids').array(),
    med_certified: boolean('med_certified').notNull().default(false),
    // The agency's effective plan features, copied here by a trigger so the
    // offline sync streams can gate data per user (entitlements.md §8).
    // Never set by the app; never synced.
    plan_features: text('plan_features').array().notNull().default([]),
    mfa_enabled: boolean('mfa_enabled').notNull().default(false),
    // When this person last got a session (/auth/session), for the access
    // review (security.md "Automated Detection"). Server-only; never synced.
    last_sign_in_at: timestamp('last_sign_in_at', { withTimezone: true }),
    avatar_url: text('avatar_url'),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('profiles_auth_uid_idx').on(t.auth_uid),
    index('profiles_agency_id_idx').on(t.agency_id),
    index('profiles_email_idx').on(t.email),
  ],
);

// ─── 3. homes ────────────────────────────────────────────────────────────────

export const homes = pgTable(
  'homes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    lat: real('lat'),
    lng: real('lng'),
    radius: integer('radius').notNull().default(150),
    // Set when an admin archives a home that has closed (home.archive). An
    // archived home keeps all its records, read-only: no new clock-ins,
    // shifts, admissions or rooms. Null for a home in use. Reversible.
    // Homes are never deleted: every table pointing here restricts deletes,
    // so records stay for their retention period (security.md).
    archived_at: timestamp('archived_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('homes_agency_id_idx').on(t.agency_id),
  ],
);

// ─── 4. clients ──────────────────────────────────────────────────────────────

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    first_name: text('first_name'),
    initials: text('initials'),
    info: text('info'),
    behaviors: text('behaviors').array(),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('clients_agency_id_idx').on(t.agency_id),
    index('clients_home_id_idx').on(t.home_id),
  ],
);

// ─── 5. client_health_info ───────────────────────────────────────────────────

export const clientHealthInfo = pgTable(
  'client_health_info',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    allergies: text('allergies'),
    conditions: text('conditions'),
    diet: text('diet'),
    doctor: text('doctor'),
    guardian: text('guardian'),
    dob: date('dob'),
    // This person's vital alert limits, set by a nurse or supervisor
    // (domain/vitals.ts VitalLimits, any subset of tempLo/tempHi, pulseLo/
    // pulseHi, sysLo/sysHi, diaLo/diaHi). Null or missing keys use the
    // agency defaults (frontend-audit.md finding 18).
    vital_limits: jsonb('vital_limits'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('client_health_info_home_id_idx').on(t.home_id),
    uniqueIndex('client_health_info_client_id_idx').on(t.client_id),
    index('client_health_info_agency_id_idx').on(t.agency_id),
  ],
);

// ─── 6. goals ────────────────────────────────────────────────────────────────

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    area: text('area').notNull(),
    text: text('text').notNull(),
    steps: text('steps').array(),
    frequency: text('frequency'),
    target: text('target'),
    started_at: timestamp('started_at', { withTimezone: true }),
    stopped_at: timestamp('stopped_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('goals_home_id_idx').on(t.home_id),
    index('goals_agency_id_idx').on(t.agency_id),
    index('goals_client_id_idx').on(t.client_id),
  ],
);

// ─── 7. goal_templates ───────────────────────────────────────────────────────

export const goalTemplates = pgTable(
  'goal_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    area: text('area').notNull(),
    text: text('text').notNull(),
    steps: text('steps').array(),
    is_default: boolean('is_default').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('goal_templates_agency_id_idx').on(t.agency_id),
  ],
);

// ─── 8. medications ──────────────────────────────────────────────────────────

export const medications = pgTable(
  'medications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    dose: text('dose'),
    route: text('route'),
    // Every daily dose time (e.g. ['08:00', '20:00'] for twice daily).
    // Empty or null for PRN-only medications.
    scheduled_times: time('scheduled_times').array(),
    prn_instructions: text('prn_instructions'),
    notes: text('notes'),
    // Controlled substance (DEA Schedule II-V): counted at shift change, with
    // receipts and waste witnessed (controlled_counts, domain/controlled.ts).
    controlled: boolean('controlled').notNull().default(false),
    controlled_schedule: text('controlled_schedule'),
    // Units taken from stock by one given dose (tablets, mL), for the running count.
    units_per_dose: real('units_per_dose').notNull().default(1),
    started_at: timestamp('started_at', { withTimezone: true }),
    stopped_at: timestamp('stopped_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('medications_home_id_idx').on(t.home_id),
    index('medications_agency_id_idx').on(t.agency_id),
    index('medications_client_id_idx').on(t.client_id),
  ],
);

// ─── 9. medication_history ───────────────────────────────────────────────────

export const medicationHistory = pgTable(
  'medication_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    medication_id: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'cascade' }),
    action: medHistoryActionEnum('action').notNull(),
    changed_by: uuid('changed_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    changed_at: timestamp('changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('medication_history_agency_id_idx').on(t.agency_id),
    index('medication_history_medication_id_idx').on(t.medication_id),
  ],
);

// ─── 10. notes ───────────────────────────────────────────────────────────────

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    author_id: uuid('author_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    author_name: text('author_name'),
    day: date('day').notNull(),
    // Which shift the note covers. `day` is the shift's start date, so an
    // overnight (on) note written at 2am belongs to the previous day.
    // Each shift writes its own note: AM, PM and overnight staff all chart.
    shift: shiftKeyEnum('shift').notNull(),
    type: noteTypeEnum('type').notNull(),
    content: jsonb('content').default({}),
    status: noteStatusEnum('status').notNull().default('draft'),
    supervisor_comment: text('supervisor_comment'),
    lomi_drafted: boolean('lomi_drafted').notNull().default(false),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('notes_agency_id_idx').on(t.agency_id),
    index('notes_client_id_day_shift_idx').on(t.client_id, t.day, t.shift),
    index('notes_home_id_day_idx').on(t.home_id, t.day),
    index('notes_author_id_idx').on(t.author_id),
    index('notes_status_idx').on(t.status),
  ],
);

// ─── 11. note_goals ──────────────────────────────────────────────────────────

export const noteGoals = pgTable(
  'note_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    note_id: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    goal_id: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'restrict' }),
    trials: text('trials').array(),
    not_attempted: boolean('not_attempted').notNull().default(false),
    reason: text('reason'),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('note_goals_home_id_idx').on(t.home_id),
    index('note_goals_agency_id_idx').on(t.agency_id),
    index('note_goals_note_id_idx').on(t.note_id),
    index('note_goals_goal_id_idx').on(t.goal_id),
  ],
);

// ─── 12. note_history ────────────────────────────────────────────────────────

export const noteHistory = pgTable(
  'note_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    note_id: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    by_name: text('by_name'),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('note_history_agency_id_idx').on(t.agency_id),
    index('note_history_note_id_idx').on(t.note_id),
  ],
);

// ─── 13. incidents ───────────────────────────────────────────────────────────

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    author_id: uuid('author_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    author_name: text('author_name'),
    type: incidentTypeEnum('type').notNull(),
    severity: incidentSeverityEnum('severity').notNull().default('Low'),
    occurred_at: timestamp('occurred_at', { withTimezone: true }),
    location: text('location'),
    description: text('description').notNull(),
    antecedent: text('antecedent'),
    injured: text('injured'),
    injury_detail: text('injury_detail'),
    staff_action: text('staff_action'),
    medical_followup: text('medical_followup'),
    witnesses: text('witnesses'),
    // Each witness's name and role (domain/incident-details.ts). `witnesses`
    // keeps a readable copy for exports and older records.
    witness_list: jsonb('witness_list').notNull().default([]),
    notified_parties: text('notified_parties').array(),
    // Optional details many state IDD reports ask for (frontend-audit.md
    // finding 8): condition now, alone or with staff, restraint, self-injury,
    // injury locations, medication and environmental factors, corrective plan.
    // Shape and allowed values: src/lib/domain/incident-details.ts.
    report_details: jsonb('report_details').notNull().default({}),
    status: incidentStatusEnum('status').notNull().default('open'),
    // When a supervisor first reviewed it (incident.review); later edits to
    // the follow-up notes don't move it. Null while open, and on incidents
    // reviewed before this column existed.
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    followup_notes: text('followup_notes'),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('incidents_agency_id_idx').on(t.agency_id),
    index('incidents_client_id_idx').on(t.client_id),
    index('incidents_home_id_idx').on(t.home_id),
    index('incidents_severity_idx').on(t.severity),
  ],
);

// ─── 14. mar_records ─────────────────────────────────────────────────────────

export const marRecords = pgTable(
  'mar_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    medication_id: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'restrict' }),
    day: date('day').notNull(),
    // The dose slot this record answers (one of medications.scheduled_times).
    // Null for PRN doses.
    scheduled_time: time('scheduled_time'),
    status: marStatusEnum('status').notNull(),
    recorded_at: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    recorded_by: uuid('recorded_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    recorded_by_name: text('recorded_by_name'),
    reason: text('reason'),
    effect: text('effect'),
    is_prn: boolean('is_prn').notNull().default(false),
    acknowledged: boolean('acknowledged').notNull().default(false),
    amends_id: uuid('amends_id').references((): AnyPgColumn => marRecords.id, {
      onDelete: 'restrict',
    }),
    // Set when two devices recorded the same dose slot while offline. The
    // later record is kept (never discarded) and points at the first one,
    // and a mandatory med_possible_double_dose alert goes to the supervisor.
    conflict_with: uuid('conflict_with').references((): AnyPgColumn => marRecords.id, {
      onDelete: 'restrict',
    }),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('mar_records_home_id_idx').on(t.home_id),
    index('mar_records_agency_id_idx').on(t.agency_id),
    index('mar_records_client_id_day_idx').on(t.client_id, t.day),
    // One original record per scheduled dose slot. Amendments and offline
    // conflict records are excluded so corrections can always be written.
    uniqueIndex('mar_records_client_med_day_slot_idx')
      .on(t.client_id, t.medication_id, t.day, t.scheduled_time)
      .where(sql`is_prn = false AND amends_id IS NULL AND conflict_with IS NULL`),
  ],
);

// ─── 15. health_entries ──────────────────────────────────────────────────────

export const healthEntries = pgTable(
  'health_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    kind: healthEntryKindEnum('kind').notNull(),
    data: jsonb('data').default({}),
    recorded_at: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    recorded_by: uuid('recorded_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    flags: text('flags').array(),
    acknowledged: boolean('acknowledged').notNull().default(false),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('health_entries_home_id_idx').on(t.home_id),
    index('health_entries_agency_id_idx').on(t.agency_id),
    index('health_entries_client_id_idx').on(t.client_id),
  ],
);

// ─── 16. attendance ──────────────────────────────────────────────────────────

export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    day: date('day').notNull(),
    services: text('services').array(),
    recorded_at: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    recorded_by: uuid('recorded_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    recorded_by_name: text('recorded_by_name'),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('attendance_home_id_idx').on(t.home_id),
    index('attendance_agency_id_idx').on(t.agency_id),
    uniqueIndex('attendance_client_id_day_idx').on(t.client_id, t.day),
  ],
);

// ─── 17. messages ────────────────────────────────────────────────────────────

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    from_name: text('from_name').notNull(),
    body: text('body').notNull(),
    // The person supported this message is about, if any (frontend-audit.md
    // finding 19); shown on their page.
    client_id: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    // A reply's thread: the first message of the thread, on the same board
    // (frontend-audit.md finding 19). Replies to a reply join the same thread.
    reply_to: uuid('reply_to').references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),
    // The incident a thread follows up on, from the same home.
    incident_id: uuid('incident_id').references(() => incidents.id, { onDelete: 'set null' }),
    // A photo shared with the message (message_photos, uploaded online first).
    photo_id: uuid('photo_id').references((): AnyPgColumn => messagePhotos.id, {
      onDelete: 'set null',
    }),
    sent_at: timestamp('sent_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('messages_agency_id_idx').on(t.agency_id),
    index('messages_home_id_idx').on(t.home_id),
  ],
);

// ─── 18. coverage_requests ───────────────────────────────────────────────────

export const coverageRequests = pgTable(
  'coverage_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    day: date('day').notNull(),
    shift: shiftKeyEnum('shift').notNull(),
    called_out_by: uuid('called_out_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    reason: text('reason'),
    status: coverageStatusEnum('status').notNull().default('searching'),
    started_at: timestamp('started_at', { withTimezone: true }),
    filled_by: uuid('filled_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    filled_at: timestamp('filled_at', { withTimezone: true }),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('coverage_requests_agency_id_idx').on(t.agency_id),
    index('coverage_requests_home_id_day_idx').on(t.home_id, t.day),
  ],
);

// ─── 19. coverage_candidates ─────────────────────────────────────────────────

export const coverageCandidates = pgTable(
  'coverage_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    coverage_request_id: uuid('coverage_request_id')
      .notNull()
      .references(() => coverageRequests.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    eligible: boolean('eligible').notNull().default(false),
    eligibility_reason: text('eligibility_reason'),
    reply: candidateReplyEnum('reply').notNull().default('pending'),
    replied_at: timestamp('replied_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('coverage_candidates_agency_id_idx').on(t.agency_id),
    index('coverage_candidates_request_id_idx').on(t.coverage_request_id),
    index('coverage_candidates_profile_id_idx').on(t.profile_id),
  ],
);

// ─── 20. coverage_steps ──────────────────────────────────────────────────────

export const coverageSteps = pgTable(
  'coverage_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    coverage_request_id: uuid('coverage_request_id')
      .notNull()
      .references(() => coverageRequests.id, { onDelete: 'cascade' }),
    // Denormalized from clients.home_id so PowerSync sync rules can filter on it
    // without joins. Kept in step by the clients_home_change trigger (rls.sql).
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    description: text('description').notNull(),
    occurred_at: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('coverage_steps_home_id_idx').on(t.home_id),
    index('coverage_steps_agency_id_idx').on(t.agency_id),
    index('coverage_steps_request_id_idx').on(t.coverage_request_id),
  ],
);

// ─── 21. clock_records ───────────────────────────────────────────────────────

export const clockRecords = pgTable(
  'clock_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    clock_in_at: timestamp('clock_in_at', { withTimezone: true }).notNull(),
    clock_in_lat: real('clock_in_lat'),
    clock_in_lng: real('clock_in_lng'),
    clock_out_at: timestamp('clock_out_at', { withTimezone: true }),
    clock_out_lat: real('clock_out_lat'),
    clock_out_lng: real('clock_out_lng'),
    accuracy: real('accuracy'),
    reason: text('reason'),
    verified: boolean('verified').notNull().default(false),
    manual_override: boolean('manual_override').notNull().default(false),
    distance_meters: real('distance_meters'),
    acknowledged: boolean('acknowledged').notNull().default(false),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('clock_records_agency_id_idx').on(t.agency_id),
    index('clock_records_profile_id_idx').on(t.profile_id),
    index('clock_records_home_id_idx').on(t.home_id),
  ],
);

// ─── 22. schedule_slots ──────────────────────────────────────────────────────

export const scheduleSlots = pgTable(
  'schedule_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    day: date('day').notNull(),
    shift: shiftKeyEnum('shift').notNull(),
    assigned_to: uuid('assigned_to').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    status: slotStatusEnum('status').notNull().default('open'),
    via_lomi: boolean('via_lomi').notNull().default(false),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('schedule_slots_agency_id_idx').on(t.agency_id),
    uniqueIndex('schedule_slots_agency_day_shift_home_idx').on(
      t.agency_id,
      t.day,
      t.shift,
      t.home_id,
    ),
    index('schedule_slots_home_id_day_idx').on(t.home_id, t.day),
    index('schedule_slots_assigned_to_idx').on(t.assigned_to),
  ],
);

// ─── 23. events ──────────────────────────────────────────────────────────────

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    table_name: text('table_name'),
    record_id: uuid('record_id'),
    event_type: text('event_type').notNull(),
    detail: jsonb('detail').default({}),
    home_id: uuid('home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('events_agency_id_idx').on(t.agency_id),
    index('events_home_id_idx').on(t.home_id),
    index('events_event_type_idx').on(t.event_type),
  ],
);

// ─── 24. audit_log ───────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),
    table_name: text('table_name').notNull(),
    record_id: uuid('record_id').notNull(),
    action: auditActionEnum('action').notNull(),
    old_values: jsonb('old_values'),
    new_values: jsonb('new_values'),
    performed_by: uuid('performed_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('audit_log_agency_id_idx').on(t.agency_id),
    index('audit_log_table_record_idx').on(t.table_name, t.record_id),
    index('audit_log_performed_by_idx').on(t.performed_by),
  ],
);

// ─── 25. notifications ──────────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    channel: text('channel').notNull(),
    priority: integer('priority').notNull().default(3),
    status: notificationStatusEnum('status').notNull().default('pending'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    read_at: timestamp('read_at', { withTimezone: true }),
    reference_id: uuid('reference_id'),
    reference_type: text('reference_type'),
    // Message ID returned by FCM, SES or AWS End User Messaging, used to match
    // delivery events (notifications.md §6-7).
    provider_message_id: text('provider_message_id'),
    // false once the row is older than its device sync window (set nightly by
    // SyncWindowJob). Sync rules filter on this instead of time functions.
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('notifications_agency_id_idx').on(t.agency_id),
    // Rate limits count a recipient's recent sends per channel (notifications.md §10).
    index('notifications_profile_channel_created_idx').on(t.profile_id, t.channel, t.created_at),
    index('notifications_status_idx').on(t.status),
    index('notifications_provider_message_id_idx').on(t.provider_message_id),
  ],
);

// ─── 26. notification_preferences ────────────────────────────────────────────

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    notification_type: text('notification_type').notNull(),
    push_enabled: boolean('push_enabled').notNull().default(true),
    sms_enabled: boolean('sms_enabled').notNull().default(false),
    email_enabled: boolean('email_enabled').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('notification_prefs_agency_id_idx').on(t.agency_id),
    index('notification_prefs_profile_id_idx').on(t.profile_id),
    uniqueIndex('notification_prefs_profile_type_idx').on(t.profile_id, t.notification_type),
  ],
);

// ─── 27. sync_checkpoints ────────────────────────────────────────────────────

export const syncCheckpoints = pgTable(
  'sync_checkpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    table_name: text('table_name').notNull(),
    last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
    checkpoint_token: text('checkpoint_token'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('sync_checkpoints_agency_id_idx').on(t.agency_id),
    index('sync_checkpoints_profile_id_idx').on(t.profile_id),
  ],
);

// ─── 28. case_notes ──────────────────────────────────────────────────────────

export const caseNotes = pgTable(
  'case_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    author_id: uuid('author_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    author_name: text('author_name'),
    body: text('body').notNull(),
    // What the note is about (US-15): one of CASE_NOTE_CATEGORIES in
    // domain/case-notes.ts. Null on notes written before categories existed.
    category: text('category'),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('case_notes_agency_id_idx').on(t.agency_id),
    index('case_notes_client_id_idx').on(t.client_id),
  ],
);

// ─── 29. referrals ───────────────────────────────────────────────────────────

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    contact_name: text('contact_name'),
    contact_phone: text('contact_phone'),
    contact_email: text('contact_email'),
    client_name: text('client_name'),
    source: text('source'),
    placement_needs: jsonb('placement_needs')
      .$type<{ medicationCertifiedStaff: 'unknown' | 'required' | 'not_required' }>()
      .notNull()
      .default({ medicationCertifiedStaff: 'unknown' }),
    status: referralStatusEnum('status').notNull().default('inquiry'),
    assigned_home_id: uuid('assigned_home_id').references(() => homes.id, {
      onDelete: 'restrict',
    }),
    notes: text('notes'),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('referrals_agency_id_idx').on(t.agency_id),
    index('referrals_status_idx').on(t.status),
  ],
);

// ─── 30. rooms ───────────────────────────────────────────────────────────────

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    capacity: integer('capacity').notNull().default(1),
    occupied_by: uuid('occupied_by').references(() => clients.id, {
      onDelete: 'restrict',
    }),
    status: roomStatusEnum('status').notNull().default('available'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('rooms_agency_id_idx').on(t.agency_id),
    index('rooms_home_id_idx').on(t.home_id),
  ],
);

// ─── 31. device_tokens ───────────────────────────────────────────────────────
// FCM push tokens, one row per device (notifications.md §5). Not synced.

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform'),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('device_tokens_agency_id_idx').on(t.agency_id),
    index('device_tokens_profile_id_idx').on(t.profile_id),
    uniqueIndex('device_tokens_token_idx').on(t.token),
  ],
);

// ─── 32. email_suppressions ──────────────────────────────────────────────────
// Bounced or complained addresses (notifications.md §7). The only copy of the suppression list.

export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    reason: text('reason').notNull(),
    suppressed_at: timestamp('suppressed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('email_suppressions_agency_id_idx').on(t.agency_id),
    uniqueIndex('email_suppressions_agency_email_idx').on(t.agency_id, t.email),
  ],
);

// ─── 33. user_settings ───────────────────────────────────────────────────────
// Per-user preferences: theme, quiet hours, progressive-disclosure counters
// (frontend-spec-1.md §10.1, frontend-spec-2.md §6.5, notifications.md §9).
// Contains no PHI. Synced in the user_data bucket so it works offline.

export const userSettings = pgTable(
  'user_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    theme: text('theme').notNull().default('auto'),
    quiet_hours_start: time('quiet_hours_start'),
    quiet_hours_end: time('quiet_hours_end'),
    disclosure: jsonb('disclosure').default({}),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('user_settings_agency_id_idx').on(t.agency_id),
    uniqueIndex('user_settings_profile_id_idx').on(t.profile_id),
  ],
);

// ─── 34. api_keys ────────────────────────────────────────────────────────────
// Agency-scoped keys for the external OpenAPI surface. Only a hash is stored.

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key_hash: text('key_hash').notNull(),
    key_prefix: text('key_prefix').notNull(),
    scope: text('scope').notNull().default('read'),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('api_keys_agency_id_idx').on(t.agency_id),
    uniqueIndex('api_keys_key_hash_idx').on(t.key_hash),
  ],
);

// ─── 35. webhooks ────────────────────────────────────────────────────────────

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    events: text('events').array().notNull(),
    description: text('description'),
    // SHA-256 of the signing secret (a fingerprint; the secret is shown once).
    secret_hash: text('secret_hash').notNull(),
    // The signing secret, AES-256-GCM sealed under DEVICE_KEY_KEK with the
    // webhook ID as AAD: HMAC signing needs the secret itself, not its hash.
    secret_sealed: text('secret_sealed'),
    // The API key that registered it: revoking the key stops its webhooks.
    // Null for webhooks registered before this was recorded.
    created_by_key_id: uuid('created_by_key_id').references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('webhooks_agency_id_idx').on(t.agency_id),
  ],
);

// ─── 36. webhook_deliveries ──────────────────────────────────────────────────

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    webhook_id: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    // The audit_log row the event came from (one delivery per webhook and row).
    audit_id: uuid('audit_id'),
    // The signed JSON body (IDs and status only, never PHI; openapi.yaml WebhookPayload).
    payload: jsonb('payload'),
    attempts: integer('attempts').notNull().default(0),
    last_error: text('last_error'),
    status: text('status').notNull().default('pending'),
    status_code: integer('status_code'),
    response_time_ms: integer('response_time_ms'),
    attempted_at: timestamp('attempted_at', { withTimezone: true }),
    next_retry_at: timestamp('next_retry_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('webhook_deliveries_agency_id_idx').on(t.agency_id),
    index('webhook_deliveries_webhook_id_idx').on(t.webhook_id),
    uniqueIndex('webhook_deliveries_webhook_audit_idx').on(t.webhook_id, t.audit_id),
  ],
);

// ─── 37. report_jobs ─────────────────────────────────────────────────────────
// Async report generation (report.generate / POST /reports/{type}). Files live
// in private storage and expire 24h after ready_at.

export const reportJobs = pgTable(
  'report_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    requested_by: uuid('requested_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    type: text('type').notNull(),
    format: text('format').notNull().default('csv'),
    params: jsonb('params').default({}),
    status: text('status').notNull().default('queued'),
    storage_path: text('storage_path'),
    ready_at: timestamp('ready_at', { withTimezone: true }),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('report_jobs_agency_id_idx').on(t.agency_id),
    index('report_jobs_requested_by_idx').on(t.requested_by),
  ],
);

// ─── 38. device_keys ─────────────────────────────────────────────────────────
// Server copy of each device's local database key (offline-sync.md "Local
// Database Encryption Key"). Never synced and never readable by clients: the
// Device Service (app_service) issues the key once per sign-in. key_ciphertext
// is AES-256-GCM under a server key-encryption key (Secret Manager in
// production). Deactivating a user or device sets revoked_at, after which the
// key is never issued again, so a stolen device can't be re-keyed.

export const deviceKeys = pgTable(
  'device_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    // Random ID the device generates once and keeps next to its wrapped key
    device_id: uuid('device_id').notNull(),
    key_ciphertext: text('key_ciphertext').notNull(),
    last_issued_at: timestamp('last_issued_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('device_keys_profile_device_idx').on(t.profile_id, t.device_id),
    index('device_keys_agency_id_idx').on(t.agency_id),
  ],
);

// ─── 39. email_bounces ───────────────────────────────────────────────────────
// Soft (transient) bounces per address (notifications.md §7 "Bounce Handling"):
// three within 24 hours count as a hard bounce. Written by the Notification
// Service (app_service) from SES events; no PHI, never synced.

export const emailBounces = pgTable(
  'email_bounces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('email_bounces_agency_id_idx').on(t.agency_id),
    index('email_bounces_lookup_idx').on(t.agency_id, t.email, t.created_at),
  ],
);

// ─── 40. sms_inbound_messages ────────────────────────────────────────────────
// Inbound SMS already handled (notifications.md §6 "Incoming Replies"). SNS
// delivers at least once; the unique message ID makes a re-delivered "YES"
// a no-op. Message IDs only, never the text or the number.

export const smsInboundMessages = pgTable(
  'sms_inbound_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    message_id: text('message_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('sms_inbound_messages_agency_id_idx').on(t.agency_id),
    uniqueIndex('sms_inbound_messages_message_id_idx').on(t.message_id),
  ],
);

// ─── 41. message_reads ───────────────────────────────────────────────────────
// Read receipts for the home message board (frontend-audit.md finding 19):
// one row per reader per message, written when the board shows the message.
// Append-only; the unique pair makes a second device's receipt a no-op.

export const messageReads = pgTable(
  'message_reads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    message_id: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    profile_id: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reader_name: text('reader_name').notNull(),
    read_at: timestamp('read_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // false once older than the messages sync window (SyncWindowJob).
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('message_reads_agency_id_idx').on(t.agency_id),
    index('message_reads_home_id_idx').on(t.home_id),
    uniqueIndex('message_reads_message_profile_idx').on(t.message_id, t.profile_id),
  ],
);

// ─── 42. controlled_counts ───────────────────────────────────────────────────
// The count book for controlled medications: stock received, shift counts,
// waste and disposal. Given doses come from mar_records, so the expected
// amount on hand is the last count plus receipts minus given doses and waste
// (domain/controlled.ts). Append-only like the MAR: a wrong entry is followed
// by a new count, never edited. The only update is the named witness
// countersigning (witness_status pending -> verified), enforced in rls.sql.

export const controlledCounts = pgTable(
  'controlled_counts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    medication_id: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'restrict' }),
    // receipt | count | waste | disposal
    kind: text('kind').notNull(),
    // Units received, counted on hand, wasted or disposed of.
    quantity: real('quantity').notNull(),
    // For counts: what the record said should be on hand at the time.
    expected: real('expected'),
    discrepancy: boolean('discrepancy').notNull().default(false),
    // Waste reason, disposal method or a short note. No client details.
    reason: text('reason'),
    recorded_by: uuid('recorded_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    recorded_by_name: text('recorded_by_name').notNull(),
    witness_id: uuid('witness_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    witness_name: text('witness_name'),
    // none | pending | verified
    witness_status: text('witness_status').notNull().default('none'),
    witnessed_at: timestamp('witnessed_at', { withTimezone: true }),
    // SHA-256 of the witness's ID token when they signed in on this device.
    // Unique, so one sign-in can witness one entry only.
    witness_sign_in: text('witness_sign_in'),
    recorded_at: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // false once older than the clinical sync window (SyncWindowJob).
    device_sync: boolean('device_sync').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('controlled_counts_agency_id_idx').on(t.agency_id),
    index('controlled_counts_home_id_idx').on(t.home_id),
    index('controlled_counts_medication_idx').on(t.medication_id, t.recorded_at),
    index('controlled_counts_witness_idx').on(t.witness_id, t.witness_status),
    uniqueIndex('controlled_counts_witness_sign_in_idx').on(t.witness_sign_in),
  ],
);

// ─── 43. schedule_templates ──────────────────────────────────────────────────
// A home's usual week, saved by a supervisor and applied to fill a week's open
// shifts (frontend-audit.md finding 17). slots: [{ weekday 0-6 from the week's
// first day, shift 'am' | 'pm' | 'on', profileId }]; parsed by
// domain/schedule-templates.ts. Staff names only, no client data. Not synced.

export const scheduleTemplates = pgTable(
  'schedule_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slots: jsonb('slots').notNull().default([]),
    created_by: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('schedule_templates_agency_id_idx').on(t.agency_id),
    uniqueIndex('schedule_templates_home_name_idx').on(t.home_id, t.name),
  ],
);

// ─── 44. message_photos ──────────────────────────────────────────────────────
// A photo shared on a home's board (frontend-audit.md finding 19, fix 3),
// e.g. a rash or a swollen ankle to show the nurse. The image is stored in a
// private bucket (MEDIA_BUCKET, or .data/media locally) at
// photos/<agency_id>/<id>.jpg, re-encoded on the device so it carries no
// location data. Read through message.photo only, which checks access and
// records the view. Not synced: devices fetch a photo when it is opened.

export const messagePhotos = pgTable(
  'message_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'restrict' }),
    uploaded_by: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    content_type: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('message_photos_agency_id_idx').on(t.agency_id),
    index('message_photos_home_id_idx').on(t.home_id),
  ],
);

// ─── 45. referral_notes ──────────────────────────────────────────────────────
// Notes at each intake stage (US-29): what happened at a referral's stage
// (a tour, a call, why it was declined). Each note keeps the stage the
// referral was at when it was written. Append-only; supervisors and admins
// only, like referrals. Not synced: intake is online.

export const referralNotes = pgTable(
  'referral_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    referral_id: uuid('referral_id')
      .notNull()
      .references(() => referrals.id, { onDelete: 'cascade' }),
    status: referralStatusEnum('status').notNull(),
    body: text('body').notNull(),
    author_id: uuid('author_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    author_name: text('author_name'),
    created_by: uuid('created_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('referral_notes_agency_id_idx').on(t.agency_id),
    index('referral_notes_referral_id_idx').on(t.referral_id),
  ],
);

// Carrier STOP/START state is separate from ordinary notification preferences.
// Server-only, never synced; keyed by a phone digest within each agency so staff
// sharing a number share its suppression. Only verified inbound replies grant or
// revoke consent; initialization conservatively captures legacy/unknown state.
export const smsCarrierConsents = pgTable(
  'sms_carrier_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
    phone_hash: text('phone_hash').notNull(),
    state: text('state').$type<'unknown' | 'stopped' | 'started' | 'legacy_suppressed'>().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sms_carrier_consents_agency_phone_idx').on(t.agency_id, t.phone_hash),
  ],
);

// Prospective, append-only evidence for coverage-offer channel handling. This
// deliberately records no contact address, provider payload or message body.
// It starts at deployment (there is no historical backfill) and keeps provider
// acceptance distinct from a later provider delivery callback.
export const coverageOfferEvidence = pgTable(
  'coverage_offer_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
    home_id: uuid('home_id').notNull().references(() => homes.id, { onDelete: 'restrict' }),
    coverage_request_id: uuid('coverage_request_id')
      .notNull()
      .references(() => coverageRequests.id, { onDelete: 'restrict' }),
    notification_id: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'set null',
    }),
    recipient_profile_id: uuid('recipient_profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    channel: text('channel').notNull(),
    event: coverageOfferEvidenceEventEnum('event').notNull(),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coverage_offer_evidence_notification_event_idx').on(t.notification_id, t.event),
    index('coverage_offer_evidence_agency_home_request_idx').on(
      t.agency_id,
      t.home_id,
      t.coverage_request_id,
    ),
  ],
);

// ─── 48. disclosures ─────────────────────────────────────────────────────────
// Disclosures of a person's records that HIPAA requires an accounting of
// (45 CFR 164.528): reports to APS or the state, court orders, law
// enforcement, surveyors and the like. Not treatment, payment, operations,
// the person or guardian, or anything they authorized. Supervisors and
// admins record them; append-only, never synced (security.md "Accounting of
// disclosures"). State reports ticked on incidents are added to the
// accounting from the incident itself, not copied here.
export const disclosures = pgTable(
  'disclosures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agency_id: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    disclosed_on: date('disclosed_on').notNull(),
    recipient: text('recipient').notNull(),
    recipient_address: text('recipient_address'),
    // What was shared, briefly: "Incident report and MAR for March 2026"
    description: text('description').notNull(),
    // domain/disclosure.ts DISCLOSURE_PURPOSES
    purpose: text('purpose').notNull(),
    // Optional free text: the request or order it answered
    purpose_detail: text('purpose_detail'),
    recorded_by: uuid('recorded_by').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    recorded_by_name: text('recorded_by_name'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('disclosures_agency_id_idx').on(t.agency_id),
    index('disclosures_client_id_idx').on(t.client_id, t.disclosed_on),
  ],
);
