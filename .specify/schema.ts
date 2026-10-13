/**
 * Guad — HIPAA-compliant Postgres schema (Drizzle ORM)
 *
 * Every table carries agency_id for tenant isolation and RLS.
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
    supabase_uid: uuid('supabase_uid').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    name: text('name').notNull(),
    initials: text('initials'),
    role: userRoleEnum('role').notNull().default('caregiver'),
    home_ids: uuid('home_ids').array(),
    med_certified: boolean('med_certified').notNull().default(false),
    mfa_enabled: boolean('mfa_enabled').notNull().default(false),
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
    uniqueIndex('profiles_supabase_uid_idx').on(t.supabase_uid),
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
    allergies: text('allergies'),
    conditions: text('conditions'),
    diet: text('diet'),
    doctor: text('doctor'),
    guardian: text('guardian'),
    dob: date('dob'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
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
    name: text('name').notNull(),
    dose: text('dose'),
    route: text('route'),
    scheduled_time: time('scheduled_time'),
    prn_instructions: text('prn_instructions'),
    notes: text('notes'),
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
    type: noteTypeEnum('type').notNull(),
    content: jsonb('content').default({}),
    status: noteStatusEnum('status').notNull().default('draft'),
    supervisor_comment: text('supervisor_comment'),
    lomi_drafted: boolean('lomi_drafted').notNull().default(false),
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
    index('notes_agency_id_idx').on(t.agency_id),
    index('notes_client_id_day_idx').on(t.client_id, t.day),
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
    goal_id: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'restrict' }),
    trials: text('trials').array(),
    not_attempted: boolean('not_attempted').notNull().default(false),
    reason: text('reason'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
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
    notified_parties: text('notified_parties').array(),
    status: incidentStatusEnum('status').notNull().default('open'),
    followup_notes: text('followup_notes'),
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
    medication_id: uuid('medication_id')
      .notNull()
      .references(() => medications.id, { onDelete: 'restrict' }),
    day: date('day').notNull(),
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
    amends_id: uuid('amends_id').references(() => marRecords.id, {
      onDelete: 'restrict',
    }),
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
    index('mar_records_agency_id_idx').on(t.agency_id),
    index('mar_records_client_id_day_idx').on(t.client_id, t.day),
    uniqueIndex('mar_records_client_med_day_idx')
      .on(t.client_id, t.medication_id, t.day)
      .where(sql`is_prn = false`),
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
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
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
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
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
      .references(() => homes.id, { onDelete: 'cascade' }),
    from_name: text('from_name').notNull(),
    body: text('body').notNull(),
    sent_at: timestamp('sent_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
      .references(() => homes.id, { onDelete: 'cascade' }),
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
    description: text('description').notNull(),
    occurred_at: timestamp('occurred_at', { withTimezone: true })
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
      .references(() => homes.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    shift: shiftKeyEnum('shift').notNull(),
    assigned_to: uuid('assigned_to').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    status: slotStatusEnum('status').notNull().default('open'),
    via_lomi: boolean('via_lomi').notNull().default(false),
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
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('notifications_agency_id_idx').on(t.agency_id),
    index('notifications_profile_id_idx').on(t.profile_id),
    index('notifications_status_idx').on(t.status),
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
      .references(() => homes.id, { onDelete: 'cascade' }),
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
