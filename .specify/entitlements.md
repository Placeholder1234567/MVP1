# Feature Entitlements and Subscription Tiers

## 1. Overview

Guad gates feature access at three enforcement layers to ensure agencies only reach functionality included in their subscription tier:

1. **tRPC Middleware** -- a `requireFeature` middleware intercepts procedure calls and checks the agency's `subscription_tier` and `enabled_features` before execution. Unauthorized calls return `FORBIDDEN`.
2. **UI Navigation** -- SvelteKit layouts and components use a `hasFeature()` utility to conditionally render navigation items and route guards. Features outside the agency's tier do not render at all (no upgrade teasers in v1).
3. **PowerSync Sync Rules** -- `sync_rules.yaml` wraps feature-gated tables with tier and feature checks so that data for disabled features never syncs to the client device, reducing storage footprint and preventing offline access to ungated data.

All three layers read from the same source of truth: the `agencies` row for the current tenant, specifically `subscription_tier` (enum: `starter | professional | complete`) and `enabled_features` (text array of feature flag strings for per-agency overrides).

**Schema note:** The `agencies` table must carry both columns:

```typescript
// In schema.ts -- agencies table
subscription_tier: text('subscription_tier').notNull().default('starter'),
enabled_features: text('enabled_features').array().default([]),
```

The `enabled_features` array allows sales or support to grant individual features outside a tier (e.g., giving a Starter agency access to `analytics` without upgrading to Professional). The tier mapping is the baseline; `enabled_features` is additive.

---

## 2. Subscription Tiers

| Tier | Price Point | Pillars Included | Description |
|------|-------------|------------------|-------------|
| **Starter** | Entry | Scheduling + Timekeeping | Core workforce management. Shift calendar, coverage workflow (Lomi SMS), clock-in/out with GPS verification, timesheets, and basic CSV exports (timesheets and coverage logs). Suitable for agencies that handle charting in another system. |
| **Professional** | Mid | Scheduling + Timekeeping + Care Records | Full clinical documentation. Adds shift/behavior notes, MAR, goals, health entries, incidents, attendance, basic Lomi drafting, basic Lomi daily summary (text only), and all Care Records report generation. |
| **Complete** | Premium | Scheduling + Timekeeping + Care Records + Client Intake + Enhanced Lomi + Analytics | Everything. Adds referral pipeline, room management, client-home matching, analytics dashboard (4-week trends), advanced analytics (trend analysis, benchmarking), enhanced Lomi daily summary (with highlights and recommendations), full audit log access, and all report types. |

All tiers include: authentication, agency configuration, home management, client basic info (name, home assignment), staff management, messaging, and notifications. These are foundational and always available.

---

## 3. Feature Registry

Canonical list of 19 feature flags. Every gating decision references one of these strings.

| # | Feature Flag | Pillar | Description |
|---|-------------|--------|-------------|
| 1 | `scheduling` | Scheduling | Shift calendar, slot assignment, open shift posting, `schedule.*` procedures |
| 2 | `coverage` | Scheduling | Callout workflow, Lomi coverage engine, SMS offers, `coverage.*` procedures |
| 3 | `timekeeping` | Timekeeping | Clock-in/out, GPS verification, manual entries, timesheets, `clock.*` procedures |
| 4 | `charting` | Care Records | Shift and behavior notes, note lifecycle (draft/submit/approve/return), `note.*` procedures |
| 5 | `lomi_drafting` | Care Records | AI-assisted note drafting and transcription via Lomi, `lomi.draft` and `lomi.transcribe` procedures |
| 6 | `mar` | Care Records | Medication administration records, dose recording, refusal/hold tracking, `mar.*` procedures |
| 7 | `goals` | Care Records | ISP goal definitions, templates, progress tracking, `goal.*` procedures |
| 8 | `health` | Care Records | Vitals, seizure tracking, illness records, appointments, `health.*` procedures |
| 9 | `incidents` | Care Records | Incident reporting, severity-based notifications, review workflow, `incident.*` procedures |
| 10 | `note_review` | Care Records | Supervisor note approval/return workflow (`note.approve`, `note.sendBack`); depends on `charting` (enforced -- see dependency map below) |
| 11 | `analytics` | Analytics | Supervisor dashboard metrics: overview, documentation, coverage, care analytics, `analytics.*` procedures |
| 12 | `analytics_advanced` | Analytics | Enhanced Lomi daily summary (highlights and recommendations), advanced trend analysis, benchmarking, cross-home comparisons; extends `analytics` (enforced dependency) |
| 13 | `reports` | Care Records | Full CSV/PDF report generation for all Care Records types (notes, incidents, MAR, goals, attendance), `report.*` procedures |
| 14 | `reports_basic` | Cross-cutting | Basic CSV export for timesheets and coverage logs only; available at Starter tier |
| 15 | `lomi_summary` | Care Records | Basic Lomi daily summary (text only, no highlights), `lomi.summarize` procedure in basic mode |
| 16 | `audit_log` | Compliance | Admin audit log access for compliance review, `audit.*` procedures |
| 17 | `intake` | Client Intake | Referral pipeline, room management, client-home matching, `intake.*` procedures |
| 18 | `messaging` | Cross-cutting | Home message board, shift handoff communication, `message.*` procedures |
| 19 | `notifications` | Cross-cutting | Push/SMS/email notifications, preference management, `notification.*` procedures |

**Feature dependencies:** Some flags depend on others. The `resolveFeatures` function enforces these: if a dependent flag is present but its prerequisite is not, the prerequisite is auto-added.

| Flag | Requires |
|------|----------|
| `note_review` | `charting` |
| `analytics_advanced` | `analytics` |

---

## 4. Tier to Feature Mapping

```typescript
// src/lib/entitlements/tier-features.ts
// Shared module (NOT under server/) -- used by both server middleware and client hasFeature utility

export const FEATURE_FLAGS = [
  'scheduling',
  'coverage',
  'timekeeping',
  'charting',
  'lomi_drafting',
  'mar',
  'goals',
  'health',
  'incidents',
  'note_review',
  'analytics',
  'analytics_advanced',
  'reports',
  'reports_basic',
  'lomi_summary',
  'audit_log',
  'intake',
  'messaging',
  'notifications',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type SubscriptionTier = 'starter' | 'professional' | 'complete';

/**
 * Feature dependency map. If a flag is present but its prerequisite is not,
 * resolveFeatures auto-adds the prerequisite.
 */
export const FEATURE_DEPENDENCIES: Partial<Record<FeatureFlag, FeatureFlag[]>> = {
  note_review: ['charting'],
  analytics_advanced: ['analytics'],
};

/**
 * Baseline features included in each tier.
 * Higher tiers are cumulative -- Complete includes everything in Professional,
 * which includes everything in Starter.
 */
export const TIER_FEATURES: Record<SubscriptionTier, readonly FeatureFlag[]> = {
  starter: [
    'scheduling',
    'coverage',
    'timekeeping',
    'reports_basic',
    'messaging',
    'notifications',
  ],

  professional: [
    // Starter features
    'scheduling',
    'coverage',
    'timekeeping',
    'reports_basic',
    'messaging',
    'notifications',
    // Care Records features
    'charting',
    'lomi_drafting',
    'lomi_summary',
    'mar',
    'goals',
    'health',
    'incidents',
    'note_review',
    'reports',
  ],

  complete: [
    // Professional features
    'scheduling',
    'coverage',
    'timekeeping',
    'reports_basic',
    'messaging',
    'notifications',
    'charting',
    'lomi_drafting',
    'lomi_summary',
    'mar',
    'goals',
    'health',
    'incidents',
    'note_review',
    'reports',
    // Complete-only features
    'analytics',
    'analytics_advanced',
    'audit_log',
    'intake',
  ],
} as const;
```

**Override behavior:** An agency's effective feature set is the union of its tier's baseline features and its `enabled_features` array. This allows per-agency overrides without changing their tier:

```typescript
// src/lib/server/entitlements/resolve.ts

import {
  TIER_FEATURES,
  FEATURE_DEPENDENCIES,
  FEATURE_FLAGS,
  type FeatureFlag,
  type SubscriptionTier,
} from '#lib/entitlements/tier-features';

/**
 * Resolve the effective feature set for an agency.
 * Combines tier baseline with per-agency overrides.
 * Enforces feature dependencies: if a flag requires a prerequisite,
 * the prerequisite is auto-added to the effective set.
 */
export function resolveFeatures(
  tier: SubscriptionTier,
  enabledFeatures: string[] = [],
): Set<FeatureFlag> {
  const baseline = TIER_FEATURES[tier] ?? TIER_FEATURES.starter;
  const overrides = enabledFeatures.filter(
    (f): f is FeatureFlag => FEATURE_FLAGS.includes(f as FeatureFlag),
  );
  const effective = new Set<FeatureFlag>([...baseline, ...overrides]);

  // Enforce dependencies: auto-add prerequisites
  for (const [flag, deps] of Object.entries(FEATURE_DEPENDENCIES)) {
    if (effective.has(flag as FeatureFlag)) {
      for (const dep of deps as FeatureFlag[]) {
        effective.add(dep);
      }
    }
  }

  return effective;
}

/**
 * Check if a specific feature is available for an agency.
 */
export function hasFeatureServer(
  tier: SubscriptionTier,
  enabledFeatures: string[],
  feature: FeatureFlag,
): boolean {
  return resolveFeatures(tier, enabledFeatures).has(feature);
}
```

---

## 5. tRPC Middleware Implementation

> **As built (Oct 2026):** `featureProcedure(flag)` and `featureRoleProcedure(flag, role)` in `src/lib/server/trpc/middleware.ts`. The effective feature set is resolved once per request with the user's profile (`CurrentUser.features`, from `subscription_tier` and `enabled_features`), so gating needs no extra query. `agency.get` returns `features` for the UI. The shared tier module is `src/lib/entitlements/tier-features.ts`. **Not built yet:** UI hiding (§7) and PowerSync stream gating (§8).

### Middleware

```typescript
// src/lib/server/trpc/middleware/require-feature.ts

import { TRPCError } from '@trpc/server';
import { t } from '../trpc';
import { hasFeatureServer, type FeatureFlag } from '../../entitlements/resolve';

/**
 * tRPC middleware factory that gates a procedure behind a feature flag.
 * Reads subscription_tier and enabled_features from the agency record
 * already loaded in context.
 *
 * Usage:
 *   .use(requireFeature('charting'))
 *   .use(requireFeature('mar'))
 */
export function requireFeature(feature: FeatureFlag) {
  return t.middleware(async ({ ctx, next }) => {
    const { agencyId, db } = ctx;

    // Agency record is cached in context after first load per request.
    // If not yet loaded, fetch it.
    const agency = ctx.agency ?? (await db.query.agencies.findFirst({
      where: (a, { eq }) => eq(a.id, agencyId),
      columns: {
        subscription_tier: true,
        enabled_features: true,
      },
    }));

    if (!agency) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Agency not found',
      });
    }

    const tier = (agency.subscription_tier ?? 'starter') as SubscriptionTier;
    const overrides = (agency.enabled_features ?? []) as string[];

    if (!hasFeatureServer(tier, overrides, feature)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Feature not available on current subscription tier',
        cause: {
          feature,
          tier,
          upgradeRequired: true,
        },
      });
    }

    return next({
      ctx: {
        ...ctx,
        agency, // cache for subsequent middleware in the chain
      },
    });
  });
}
```

### Usage in a Router

```typescript
// src/lib/server/trpc/routers/note.ts

import { requireFeature } from '../middleware/require-feature';
import { roleMiddleware } from '../middleware/role';
import { auditMiddleware } from '../middleware/audit';

export const noteRouter = t.router({
  create: t.procedure
    .use(authMiddleware)
    .use(requireFeature('charting'))     // gate behind charting feature
    .use(auditMiddleware)
    .input(noteCreateSchema)
    .mutation(async ({ ctx, input }) => {
      // ... create note logic
    }),

  approve: t.procedure
    .use(authMiddleware)
    .use(requireFeature('note_review'))  // gate behind note_review feature
    .use(roleMiddleware('supervisor'))
    .use(auditMiddleware)
    .input(noteApproveSchema)
    .mutation(async ({ ctx, input }) => {
      // ... approve note logic
    }),
});
```

**Middleware ordering:** `authMiddleware` always runs first (provides `agencyId`), then `requireFeature` (needs `agencyId` to load the agency record), then `roleMiddleware` (feature access is checked before role -- no point checking role if the feature is disabled), then `auditMiddleware` (mutations only).

---

## 6. Router to Feature Mapping

Every tRPC procedure is mapped to a feature flag and minimum role. Procedures marked `always` are available on all tiers.

### Always Available (no feature gate)

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `auth` | `me` | always | caregiver | App init, user hydration |
| `auth` | `updateProfile` | always | caregiver | Own profile edits |
| `agency` | `get` | always | caregiver | Agency config including tier info |
| `agency` | `update` | always | admin | Agency settings |
| `home` | `list` | always | caregiver | Home list (scoped by homeIds) |
| `home` | `get` | always | caregiver | Single home |
| `home` | `create` | always | admin | New home |
| `home` | `update` | always | admin | Edit home |
| `staff` | `list` | always | supervisor | Staff directory |
| `staff` | `get` | always | supervisor | Staff detail |
| `staff` | `invite` | always | admin | Invite new staff |
| `staff` | `update` | always | admin | Edit staff |
| `client` | `list` | always | caregiver | Client list (basic info) |
| `client` | `get` | always | caregiver | Client detail (basic info only; health info gated by `charting`) |
| `client` | `create` | always | supervisor | New client |
| `client` | `update` | always | supervisor | Edit client basic info |
| `client` | `archive` | always | admin | Archive client |
| `sync` | `upload` | always (each op is checked against its own feature, e.g. a `notes` op requires `charting`) | caregiver | Offline write upload |

### Scheduling Pillar

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `schedule` | `get` | `scheduling` | caregiver | Week schedule for a home |
| `schedule` | `setSlot` | `scheduling` | supervisor | Assign caregiver to shift |
| `schedule` | `clearSlot` | `scheduling` | supervisor | Remove assignment |
| `schedule` | `postOpen` | `scheduling` | supervisor | Post open shift, trigger Lomi coverage |
| `schedule` | `myShifts` | `scheduling` | caregiver | Own shift list |

### Coverage (Scheduling Pillar)

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `coverage` | `callout` | `coverage` | caregiver | Caregiver calls out |
| `coverage` | `list` | `coverage` | caregiver | Coverage request list |
| `coverage` | `get` | `coverage` | supervisor | Coverage detail with candidates |
| `coverage` | `accept` | `coverage` | caregiver | Accept offered shift |
| `coverage` | `decline` | `coverage` | caregiver | Decline offered shift |

### Timekeeping Pillar

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `clock` | `clockIn` | `timekeeping` | caregiver | Clock in with GPS |
| `clock` | `clockOut` | `timekeeping` | caregiver | Clock out |
| `clock` | `list` | `timekeeping` | caregiver | Clock records |
| `clock` | `manualEntry` | `timekeeping` | supervisor | Manual punch correction |
| `clock` | `acknowledge` | `timekeeping` | supervisor | Acknowledge manual/unverified |
| `clock` | `timesheet` | `timekeeping` | supervisor | Aggregated timesheet |

### Care Records Pillar -- Charting

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `note` | `create` | `charting` | caregiver | Create draft note |
| `note` | `get` | `charting` | caregiver | View note with history |
| `note` | `list` | `charting` | caregiver | Note list |
| `note` | `update` | `charting` | caregiver | Edit draft note |
| `note` | `sign` | `charting` | caregiver | Submit note |
| `note` | `approve` | `note_review` | supervisor | Approve submitted note |
| `note` | `sendBack` | `note_review` | supervisor | Return note with comment |
| `client` | `updateHealth` | `charting` | supervisor | Update client health info |

### Care Records Pillar -- Lomi AI

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `lomi` | `draft` | `lomi_drafting` | caregiver | AI note draft |
| `lomi` | `transcribe` | `lomi_drafting` | caregiver | Audio transcription |
| `lomi` | `edit` | `lomi_drafting` | caregiver | Per-section rewrite |
| `lomi` | `route` | `lomi_drafting` | caregiver | Chat message routing |
| `lomi` | `summarize` | `lomi_summary` | supervisor | Daily summary -- basic mode (text only, Professional+). If agency also has `analytics_advanced`, returns enhanced mode (with highlights and recommendations, Complete only). The procedure checks both flags internally: `lomi_summary` gates access, `analytics_advanced` controls output richness. |

### Care Records Pillar -- Medications

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `mar` | `record` | `mar` | caregiver | Record dose (med_certified required) |
| `mar` | `recordEffect` | `mar` | caregiver | Record PRN effect |
| `mar` | `list` | `mar` | caregiver | MAR entries |
| `mar` | `acknowledge` | `mar` | supervisor | Acknowledge refusal/hold |
| `medication` | `list` | `mar` | caregiver | Medication list |
| `medication` | `create` | `mar` | supervisor | Add medication |
| `medication` | `update` | `mar` | supervisor | Edit medication |
| `medication` | `stop` | `mar` | supervisor | Stop medication |
| `medication` | `history` | `mar` | supervisor | Medication change log |

### Care Records Pillar -- Goals

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `goal` | `create` | `goals` | supervisor | Create ISP goal |
| `goal` | `update` | `goals` | supervisor | Edit goal |
| `goal` | `stop` | `goals` | supervisor | Stop goal |
| `goal` | `list` | `goals` | caregiver | Goal list |
| `goal` | `listTemplates` | `goals` | supervisor | Goal templates |
| `goal` | `createTemplate` | `goals` | supervisor | Create template |

### Care Records Pillar -- Health

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `health` | `create` | `health` | caregiver | Record vitals/seizure/illness/appointment |
| `health` | `list` | `health` | caregiver | Health entries |
| `health` | `acknowledge` | `health` | supervisor | Acknowledge flagged entry |

### Care Records Pillar -- Incidents

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `incident` | `create` | `incidents` | caregiver | File incident report |
| `incident` | `get` | `incidents` | caregiver | View incident |
| `incident` | `list` | `incidents` | caregiver | Incident list |
| `incident` | `review` | `incidents` | supervisor | Add review notes |
| `incident` | `markNotified` | `incidents` | supervisor | Record notification to party |

### Care Records Pillar -- Attendance

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `attendance` | `save` | `charting` | caregiver | Record daily attendance |
| `attendance` | `list` | `charting` | caregiver | Attendance records |

### Care Records Pillar -- Case Notes

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `caseNote` | `create` | `charting` | supervisor | Create case note |
| `caseNote` | `list` | `charting` | supervisor | Case note list |

### Analytics (Complete Only)

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `analytics` | `overview` | `analytics` | supervisor | Dashboard overview (Complete tier) |
| `analytics` | `documentation` | `analytics` | supervisor | Documentation metrics (Complete tier) |
| `analytics` | `coverage` | `analytics` | supervisor | Coverage analytics (Complete tier) |
| `analytics` | `care` | `analytics` | supervisor | Clinical care metrics (Complete tier) |

### Reports

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `report` | `generate` | `reports` or `reports_basic` | supervisor | Generate report. Starter agencies (via `reports_basic`) are restricted to `type: 'timesheets'` and `type: 'coverage'` only; the procedure rejects other types with `FORBIDDEN`. Professional+ agencies (via `reports`) can generate all types. Professional: Care Records reports only (notes, incidents, MAR, goals, attendance). Complete: all report types including intake and audit. |
| `report` | `status` | `reports` or `reports_basic` | supervisor | Report generation status |
| `report` | `download` | `reports` or `reports_basic` | supervisor | Download report |

### Audit Log (Complete Only)

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `audit` | `list` | `audit_log` | admin | List audit log entries with filters (table, action, user, date range) |
| `audit` | `get` | `audit_log` | admin | Get a single audit log entry with full detail |

### Client Intake Pillar

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `intake` | `createReferral` | `intake` | supervisor | New referral |
| `intake` | `listReferrals` | `intake` | supervisor | Referral list |
| `intake` | `getReferral` | `intake` | supervisor | Referral detail |
| `intake` | `updateReferral` | `intake` | supervisor | Update referral |
| `intake` | `convertToClient` | `intake` | supervisor | Convert referral to client |
| `intake` | `listRooms` | `intake` | supervisor | Room availability |
| `intake` | `updateRoom` | `intake` | supervisor | Update room status |

### Messaging and Notifications (Cross-cutting)

| Router | Procedure | Feature Gate | Min Role | Notes |
|--------|-----------|-------------|----------|-------|
| `message` | `send` | `messaging` | caregiver | Send home message |
| `message` | `list` | `messaging` | caregiver | Message history |
| `notification` | `list` | `notifications` | caregiver | Notification list |
| `notification` | `markRead` | `notifications` | caregiver | Mark read |
| `notification` | `updatePreferences` | `notifications` | caregiver | Channel preferences |

---

## 7. UI Navigation Gating

### hasFeature Utility

```typescript
// src/lib/utils/has-feature.ts

import {
  TIER_FEATURES,
  FEATURE_FLAGS,
  FEATURE_DEPENDENCIES,
  type FeatureFlag,
  type SubscriptionTier,
} from '#lib/entitlements/tier-features';

/**
 * Client-side feature check. Uses the agency record from the auth store.
 * The agency's subscription_tier and enabled_features are loaded on app init
 * via agency.get and stored in the agency store.
 *
 * Note: TIER_FEATURES, FEATURE_FLAGS, and types live in #lib/entitlements/
 * (not #lib/server/) so they can be shared between server middleware and
 * client-side utilities without crossing the SvelteKit server/client boundary.
 */
export function hasFeature(
  tier: SubscriptionTier,
  enabledFeatures: string[],
  feature: FeatureFlag,
): boolean {
  const baseline = TIER_FEATURES[tier] ?? TIER_FEATURES.starter;
  // Validate overrides against known flags (mirrors server-side filtering)
  const validOverrides = enabledFeatures.filter(
    (f): f is FeatureFlag => (FEATURE_FLAGS as readonly string[]).includes(f),
  );
  const effective = new Set<FeatureFlag>([...baseline, ...validOverrides]);

  // Enforce dependencies (same logic as server-side resolveFeatures)
  for (const [flag, deps] of Object.entries(FEATURE_DEPENDENCIES)) {
    if (effective.has(flag as FeatureFlag)) {
      for (const dep of deps as FeatureFlag[]) {
        effective.add(dep);
      }
    }
  }

  return effective.has(feature);
}
```

### SvelteKit Layout Guard

Uses the `FeatureGuard` component pattern (see Route Guard Summary below for the full list of guarded routes):

```svelte
<!-- src/routes/(app)/charting/+layout.svelte -->
<script lang="ts">
  import FeatureGuard from '#lib/components/FeatureGuard.svelte';
</script>

<FeatureGuard feature="charting">
  <slot />
</FeatureGuard>
```

Or equivalently, the inline pattern:

```svelte
<!-- src/routes/(app)/charting/+layout.svelte -->
<script lang="ts">
  import { hasFeature } from '#lib/utils/has-feature';
  import { agencyStore } from '#lib/stores/agency';
  import { goto } from '$app/navigation';

  const agency = $derived(agencyStore.current);

  $effect(() => {
    if (agency && !hasFeature(agency.subscriptionTier, agency.enabledFeatures, 'charting')) {
      goto('/dashboard');
    }
  });
</script>

{#if agency && hasFeature(agency.subscriptionTier, agency.enabledFeatures, 'charting')}
  <slot />
{/if}
```

### Navigation Item Rendering

```svelte
<!-- src/lib/components/nav/SideNav.svelte (excerpt) -->
<script lang="ts">
  import { hasFeature } from '#lib/utils/has-feature';
  import { agencyStore } from '#lib/stores/agency';

  const agency = $derived(agencyStore.current);

  // Helper to reduce repetition
  const check = (f: FeatureFlag) => hasFeature(agency.subscriptionTier, agency.enabledFeatures, f);

  const navItems = $derived([
    // Always visible
    { label: 'Dashboard', href: '/dashboard', icon: 'home', show: true },
    { label: 'Schedule', href: '/schedule', icon: 'calendar', show: check('scheduling') },
    { label: 'Timesheets', href: '/timesheets', icon: 'clock', show: check('timekeeping') },
    { label: 'Charting', href: '/charting', icon: 'clipboard', show: check('charting') },
    { label: 'Medications', href: '/medications', icon: 'pill', show: check('mar') },
    { label: 'Goals', href: '/goals', icon: 'target', show: check('goals') },
    { label: 'Health', href: '/health', icon: 'heart', show: check('health') },
    { label: 'Incidents', href: '/incidents', icon: 'alert', show: check('incidents') },
    { label: 'Analytics', href: '/analytics', icon: 'chart', show: check('analytics') },
    { label: 'Reports', href: '/reports', icon: 'download', show: check('reports') || check('reports_basic') },
    { label: 'Intake', href: '/intake', icon: 'user-plus', show: check('intake') },
    // Note: Attendance and Case Notes are accessed via the Charting section
    // and client detail views rather than as top-level navigation items.
  ]);
</script>

<nav>
  {#each navItems.filter(item => item.show) as item}
    <a href={item.href}>{item.label}</a>
  {/each}
</nav>
```

**v1 behavior:** Features outside the agency's tier are completely hidden. No "upgrade" badges, no grayed-out items, no teaser modals. The navigation simply does not show items the agency cannot use. This avoids confusion for frontline caregivers who have no purchasing authority.

### Route Guard Summary

Every feature-gated route needs a SvelteKit layout guard (same pattern as the /charting example above). The table below lists all routes that require guards:

| Route | Feature Flag | Redirect on Deny |
|-------|-------------|-----------------|
| `/schedule` | `scheduling` | `/dashboard` |
| `/timesheets` | `timekeeping` | `/dashboard` |
| `/charting` | `charting` | `/dashboard` |
| `/medications` | `mar` | `/dashboard` |
| `/goals` | `goals` | `/dashboard` |
| `/health` | `health` | `/dashboard` |
| `/incidents` | `incidents` | `/dashboard` |
| `/analytics` | `analytics` | `/dashboard` |
| `/reports` | `reports` or `reports_basic` | `/dashboard` |
| `/intake` | `intake` | `/dashboard` |

For a reusable pattern, use a `FeatureGuard` wrapper component:

```svelte
<!-- src/lib/components/FeatureGuard.svelte -->
<script lang="ts">
  import { hasFeature } from '#lib/utils/has-feature';
  import { agencyStore } from '#lib/stores/agency';
  import { goto } from '$app/navigation';
  import type { FeatureFlag } from '#lib/entitlements/tier-features';

  let { feature, redirect = '/dashboard' }: { feature: FeatureFlag; redirect?: string } = $props();

  const agency = $derived(agencyStore.current);

  $effect(() => {
    if (agency && !hasFeature(agency.subscriptionTier, agency.enabledFeatures, feature)) {
      goto(redirect);
    }
  });
</script>

{#if agency && hasFeature(agency.subscriptionTier, agency.enabledFeatures, feature)}
  <slot />
{/if}
```

---

## 8. PowerSync Sync Gating

PowerSync sync rules determine which tables are synced to each client device. Feature-gated tables are wrapped with tier and feature checks so disabled features produce no local data.

```yaml
# sync_rules.yaml (excerpt -- feature-gated tables)

# Tables that always sync (no feature gate):
# agencies, profiles, homes, clients, sync_checkpoints

# Scheduling pillar -- included in all tiers (Starter+).
# The tier check matches all valid tiers so is effectively a no-op, but the
# pattern is kept for consistency and future-proofing if tiers change.
- table: schedule_slots
  filter: |
    SELECT ss.* FROM schedule_slots ss
    JOIN agencies a ON a.id = ss.agency_id
    WHERE ss.agency_id = :agency_id
      AND ss.home_id IN (:home_ids)
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'scheduling' = ANY(a.enabled_features)
      )

# Coverage -- included in all tiers (Starter+). Same no-op note as scheduling.
- table: coverage_requests
  filter: |
    SELECT cr.* FROM coverage_requests cr
    JOIN agencies a ON a.id = cr.agency_id
    WHERE cr.agency_id = :agency_id
      AND cr.home_id IN (:home_ids)
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'coverage' = ANY(a.enabled_features)
      )

- table: coverage_candidates
  filter: |
    SELECT cc.* FROM coverage_candidates cc
    JOIN agencies a ON a.id = cc.agency_id
    WHERE cc.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'coverage' = ANY(a.enabled_features)
      )

- table: coverage_steps
  filter: |
    SELECT cs.* FROM coverage_steps cs
    JOIN agencies a ON a.id = cs.agency_id
    WHERE cs.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'coverage' = ANY(a.enabled_features)
      )

# Timekeeping pillar -- included in all tiers (Starter+). Same no-op note.
- table: clock_records
  filter: |
    SELECT clk.* FROM clock_records clk
    JOIN agencies a ON a.id = clk.agency_id
    WHERE clk.agency_id = :agency_id
      AND clk.home_id IN (:home_ids)
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'timekeeping' = ANY(a.enabled_features)
      )

# Care Records pillar -- charting (professional and complete only)
- table: notes
  filter: |
    SELECT n.* FROM notes n
    JOIN agencies a ON a.id = n.agency_id
    WHERE n.agency_id = :agency_id
      AND n.home_id IN (:home_ids)
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'charting' = ANY(a.enabled_features)
      )

- table: note_goals
  filter: |
    SELECT ng.* FROM note_goals ng
    JOIN agencies a ON a.id = ng.agency_id
    WHERE ng.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'charting' = ANY(a.enabled_features)
      )

- table: note_history
  filter: |
    SELECT nh.* FROM note_history nh
    JOIN agencies a ON a.id = nh.agency_id
    WHERE nh.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'charting' = ANY(a.enabled_features)
      )

# Care Records pillar -- medications/MAR
- table: medications
  filter: |
    SELECT m.* FROM medications m
    JOIN agencies a ON a.id = m.agency_id
    WHERE m.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'mar' = ANY(a.enabled_features)
      )

- table: mar_records
  filter: |
    SELECT mr.* FROM mar_records mr
    JOIN agencies a ON a.id = mr.agency_id
    WHERE mr.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'mar' = ANY(a.enabled_features)
      )

- table: medication_history
  filter: |
    SELECT mh.* FROM medication_history mh
    JOIN agencies a ON a.id = mh.agency_id
    WHERE mh.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'mar' = ANY(a.enabled_features)
      )

# Care Records pillar -- goals
- table: goals
  filter: |
    SELECT g.* FROM goals g
    JOIN agencies a ON a.id = g.agency_id
    WHERE g.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'goals' = ANY(a.enabled_features)
      )

- table: goal_templates
  filter: |
    SELECT gt.* FROM goal_templates gt
    JOIN agencies a ON a.id = gt.agency_id
    WHERE gt.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'goals' = ANY(a.enabled_features)
      )

# Care Records pillar -- health entries
- table: health_entries
  filter: |
    SELECT he.* FROM health_entries he
    JOIN agencies a ON a.id = he.agency_id
    WHERE he.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'health' = ANY(a.enabled_features)
      )

# Care Records pillar -- incidents
- table: incidents
  filter: |
    SELECT i.* FROM incidents i
    JOIN agencies a ON a.id = i.agency_id
    WHERE i.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'incidents' = ANY(a.enabled_features)
      )

# Care Records pillar -- attendance
- table: attendance
  filter: |
    SELECT att.* FROM attendance att
    JOIN agencies a ON a.id = att.agency_id
    WHERE att.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'charting' = ANY(a.enabled_features)
      )

# Care Records pillar -- case notes
- table: case_notes
  filter: |
    SELECT cn.* FROM case_notes cn
    JOIN agencies a ON a.id = cn.agency_id
    WHERE cn.agency_id = :agency_id
      AND (
        a.subscription_tier IN ('professional', 'complete')
        OR 'charting' = ANY(a.enabled_features)
      )

# Client Intake pillar (complete only)
- table: referrals
  filter: |
    SELECT r.* FROM referrals r
    JOIN agencies a ON a.id = r.agency_id
    WHERE r.agency_id = :agency_id
      AND (
        a.subscription_tier = 'complete'
        OR 'intake' = ANY(a.enabled_features)
      )

- table: rooms
  filter: |
    SELECT rm.* FROM rooms rm
    JOIN agencies a ON a.id = rm.agency_id
    WHERE rm.agency_id = :agency_id
      AND (
        a.subscription_tier = 'complete'
        OR 'intake' = ANY(a.enabled_features)
      )

# Cross-cutting -- messaging and notifications are included in all tiers (Starter+).
# Feature flag checks added for consistency with other gated tables and to
# future-proof against tier changes. Currently these checks are no-ops.
- table: messages
  filter: |
    SELECT msg.* FROM messages msg
    JOIN agencies a ON a.id = msg.agency_id
    WHERE msg.agency_id = :agency_id
      AND msg.home_id IN (:home_ids)
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'messaging' = ANY(a.enabled_features)
      )

- table: notifications
  filter: |
    SELECT n.* FROM notifications n
    JOIN agencies a ON a.id = n.agency_id
    WHERE n.agency_id = :agency_id
      AND n.profile_id = :profile_id
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'notifications' = ANY(a.enabled_features)
      )

- table: notification_preferences
  filter: |
    SELECT np.* FROM notification_preferences np
    JOIN agencies a ON a.id = np.agency_id
    WHERE np.agency_id = :agency_id
      AND np.profile_id = :profile_id
      AND (
        a.subscription_tier IN ('starter', 'professional', 'complete')
        OR 'notifications' = ANY(a.enabled_features)
      )
```

**Performance note:** The join to `agencies` in sync filters is acceptable because the agency record is small and frequently cached by Postgres. The `subscription_tier` and `enabled_features` values change rarely (only on tier upgrades), so query plans are stable.

---

## 9. Upgrade Flow

### What happens when a user hits a feature gate

**Server side (tRPC):**

1. The `requireFeature` middleware throws a `FORBIDDEN` TRPCError with `cause.upgradeRequired = true` and `cause.feature` identifying the missing feature.
2. The tRPC client error handler inspects the error shape.

**Client side (SvelteKit):**

```typescript
// src/lib/trpc/error-handler.ts

import { TRPCClientError } from '@trpc/client';

export function handleTRPCError(error: TRPCClientError<any>) {
  if (error.data?.code === 'FORBIDDEN' && error.data?.cause?.upgradeRequired) {
    const feature = error.data.cause.feature;
    // Show upgrade modal
    upgradeModalStore.open({
      feature,
      message: getUpgradeMessage(feature),
    });
    return; // do not show generic error toast
  }
  // ... handle other errors
}

function getUpgradeMessage(feature: string): string {
  const messages: Record<string, string> = {
    scheduling: 'Scheduling requires an active subscription.',
    coverage: 'Shift coverage requires an active subscription.',
    timekeeping: 'Timekeeping requires an active subscription.',
    charting: 'Clinical charting requires a Professional or Complete subscription.',
    lomi_drafting: 'Lomi AI note drafting requires a Professional or Complete subscription.',
    lomi_summary: 'Lomi daily summaries require a Professional or Complete subscription.',
    mar: 'Medication administration records require a Professional or Complete subscription.',
    goals: 'ISP goal tracking requires a Professional or Complete subscription.',
    health: 'Health entry tracking requires a Professional or Complete subscription.',
    incidents: 'Incident reporting requires a Professional or Complete subscription.',
    note_review: 'Note review and approval requires a Professional or Complete subscription.',
    analytics: 'Analytics dashboard requires a Complete subscription.',
    analytics_advanced: 'Advanced analytics and enhanced Lomi summaries require a Complete subscription.',
    reports: 'Full report generation requires a Professional or Complete subscription.',
    reports_basic: 'Basic CSV reports require an active subscription.',
    audit_log: 'Audit log access requires a Complete subscription.',
    intake: 'Client intake management requires a Complete subscription.',
    messaging: 'Team messaging requires an active subscription.',
    notifications: 'Notifications require an active subscription.',
  };
  return messages[feature] ?? 'This feature requires a subscription upgrade.';
}
```

**Upgrade modal:**

```svelte
<!-- src/lib/components/UpgradeModal.svelte -->
<script lang="ts">
  import { upgradeModalStore } from '#lib/stores/upgrade-modal';
  import { authStore } from '#lib/stores/auth';

  const modal = $derived(upgradeModalStore.current);
  const isAdmin = $derived(authStore.user?.role === 'admin');
</script>

{#if modal.open}
  <dialog open>
    <h2>Feature Unavailable</h2>
    <p>{modal.message}</p>
    {#if isAdmin}
      <p>Contact support to upgrade your subscription.</p>
      <a href="mailto:support@guad.care?subject=Subscription Upgrade">
        Contact Support
      </a>
    {:else}
      <p>Ask your administrator about upgrading your agency's subscription.</p>
    {/if}
    <button onclick={() => upgradeModalStore.close()}>Close</button>
  </dialog>
{/if}
```

**v1 constraints:**
- No self-service tier change. Upgrades are handled through support/sales.
- No in-app payment or Stripe integration in v1.
- No trial periods or feature previews.
- Admin users see a "Contact Support" link. Non-admin users see a message to contact their administrator.

---

## 10. Testing Entitlements

### Unit Tests -- Middleware

```typescript
// tests/unit/entitlements/require-feature.test.ts

import { describe, it, expect } from 'vitest';
import { resolveFeatures, hasFeatureServer } from '#lib/server/entitlements/resolve';

describe('resolveFeatures', () => {
  it('starter tier includes scheduling, coverage, timekeeping, reports_basic, messaging, notifications', () => {
    const features = resolveFeatures('starter', []);
    expect(features.has('scheduling')).toBe(true);
    expect(features.has('coverage')).toBe(true);
    expect(features.has('timekeeping')).toBe(true);
    expect(features.has('reports_basic')).toBe(true);
    expect(features.has('messaging')).toBe(true);
    expect(features.has('notifications')).toBe(true);
  });

  it('starter tier excludes care records and analytics features', () => {
    const features = resolveFeatures('starter', []);
    expect(features.has('charting')).toBe(false);
    expect(features.has('mar')).toBe(false);
    expect(features.has('goals')).toBe(false);
    expect(features.has('health')).toBe(false);
    expect(features.has('incidents')).toBe(false);
    expect(features.has('analytics')).toBe(false);
    expect(features.has('intake')).toBe(false);
  });

  it('professional tier includes care records and lomi_summary but not analytics or intake', () => {
    const features = resolveFeatures('professional', []);
    expect(features.has('charting')).toBe(true);
    expect(features.has('mar')).toBe(true);
    expect(features.has('lomi_summary')).toBe(true);
    expect(features.has('reports')).toBe(true);
    expect(features.has('analytics')).toBe(false);
    expect(features.has('intake')).toBe(false);
    expect(features.has('analytics_advanced')).toBe(false);
    expect(features.has('audit_log')).toBe(false);
  });

  it('complete tier includes everything', () => {
    const features = resolveFeatures('complete', []);
    expect(features.has('intake')).toBe(true);
    expect(features.has('analytics')).toBe(true);
    expect(features.has('analytics_advanced')).toBe(true);
    expect(features.has('audit_log')).toBe(true);
    expect(features.has('lomi_summary')).toBe(true);
    expect(features.has('reports_basic')).toBe(true);
    expect(features.size).toBe(19);
  });

  it('enabled_features overrides add to tier baseline', () => {
    const features = resolveFeatures('starter', ['charting', 'mar']);
    expect(features.has('scheduling')).toBe(true);  // from tier
    expect(features.has('charting')).toBe(true);     // from override
    expect(features.has('mar')).toBe(true);          // from override
    expect(features.has('goals')).toBe(false);       // not in tier or override
  });

  it('invalid feature flag in enabled_features is ignored', () => {
    const features = resolveFeatures('starter', ['bogus_feature']);
    expect(features.has('bogus_feature' as any)).toBe(false);
    expect(features.size).toBe(6); // only starter baseline
  });

  it('defaults to starter if tier is unrecognized', () => {
    const features = resolveFeatures('enterprise' as any, []);
    expect(features.size).toBe(6);
  });

  it('enforces feature dependencies: note_review auto-adds charting', () => {
    const features = resolveFeatures('starter', ['note_review']);
    expect(features.has('note_review')).toBe(true);
    expect(features.has('charting')).toBe(true); // auto-added as dependency
  });

  it('enforces feature dependencies: analytics_advanced auto-adds analytics', () => {
    const features = resolveFeatures('starter', ['analytics_advanced']);
    expect(features.has('analytics_advanced')).toBe(true);
    expect(features.has('analytics')).toBe(true); // auto-added as dependency
  });
});

describe('hasFeatureServer', () => {
  it('returns true for feature in tier', () => {
    expect(hasFeatureServer('professional', [], 'charting')).toBe(true);
  });

  it('returns false for feature not in tier', () => {
    expect(hasFeatureServer('starter', [], 'charting')).toBe(false);
  });

  it('returns true for feature in enabled_features override', () => {
    expect(hasFeatureServer('starter', ['charting'], 'charting')).toBe(true);
  });

  it('returns false for analytics on professional tier (Complete-only)', () => {
    expect(hasFeatureServer('professional', [], 'analytics')).toBe(false);
  });

  it('returns true for analytics on complete tier', () => {
    expect(hasFeatureServer('complete', [], 'analytics')).toBe(true);
  });

  it('returns true for lomi_summary on professional tier', () => {
    expect(hasFeatureServer('professional', [], 'lomi_summary')).toBe(true);
  });

  it('returns true for reports_basic on starter tier', () => {
    expect(hasFeatureServer('starter', [], 'reports_basic')).toBe(true);
  });
});
```

### Integration Tests -- tRPC Procedures

```typescript
// tests/integration/entitlements/gated-procedures.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestContext } from '../../helpers/trpc-context';
import { caller } from '../../helpers/trpc-caller';

describe('feature-gated tRPC procedures', () => {
  describe('starter tier', () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await createTestContext({ tier: 'starter', role: 'caregiver' });
    });

    it('allows schedule.get', async () => {
      const result = await caller(ctx).schedule.get({ homeId: ctx.homeId, weekStart: '2026-10-05' });
      expect(result.slots).toBeDefined();
    });

    it('allows clock.clockIn', async () => {
      const result = await caller(ctx).clock.clockIn({ homeId: ctx.homeId });
      expect(result.id).toBeDefined();
    });

    it('rejects note.create with FORBIDDEN', async () => {
      await expect(
        caller(ctx).note.create({ clientId: ctx.clientId, homeId: ctx.homeId, type: 'shift', content: {} })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        cause: { feature: 'charting', upgradeRequired: true },
      });
    });

    it('rejects mar.record with FORBIDDEN', async () => {
      await expect(
        caller(ctx).mar.record({ clientId: ctx.clientId, medicationId: ctx.medId, day: '2026-10-11', status: 'given' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        cause: { feature: 'mar', upgradeRequired: true },
      });
    });

    it('rejects intake.createReferral with FORBIDDEN', async () => {
      await expect(
        caller(ctx).intake.createReferral({ clientName: 'Test' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        cause: { feature: 'intake', upgradeRequired: true },
      });
    });
  });

  describe('professional tier', () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await createTestContext({ tier: 'professional', role: 'supervisor' });
    });

    it('allows note.create', async () => {
      const result = await caller(ctx).note.create({ clientId: ctx.clientId, homeId: ctx.homeId, type: 'shift', content: {} });
      expect(result.status).toBe('draft');
    });

    it('allows lomi.summarize (basic mode)', async () => {
      const result = await caller(ctx).lomi.summarize({ homeId: ctx.homeId });
      expect(result.summary).toBeDefined();
      // Professional tier gets basic mode: no highlights
      expect(result.highlights).toEqual([]);
    });

    it('rejects analytics.overview with FORBIDDEN (Complete-only)', async () => {
      await expect(
        caller(ctx).analytics.overview({})
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        cause: { feature: 'analytics', upgradeRequired: true },
      });
    });

    it('rejects intake.createReferral with FORBIDDEN', async () => {
      await expect(
        caller(ctx).intake.createReferral({ clientName: 'Test' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        cause: { feature: 'intake', upgradeRequired: true },
      });
    });

    it('rejects audit.list with FORBIDDEN (Complete-only)', async () => {
      await expect(
        caller(ctx).audit.list({})
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        cause: { feature: 'audit_log', upgradeRequired: true },
      });
    });
  });

  describe('complete tier', () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await createTestContext({ tier: 'complete', role: 'supervisor' });
    });

    it('allows intake.createReferral', async () => {
      const result = await caller(ctx).intake.createReferral({ clientName: 'Test' });
      expect(result.status).toBe('inquiry');
    });

    it('allows lomi.summarize (enhanced mode with highlights)', async () => {
      const result = await caller(ctx).lomi.summarize({ homeId: ctx.homeId });
      expect(result.summary).toBeDefined();
      // Complete tier gets enhanced mode: includes highlights
      expect(result.highlights.length).toBeGreaterThan(0);
    });

    it('allows analytics.overview', async () => {
      const result = await caller(ctx).analytics.overview({});
      expect(result.notesCount).toBeDefined();
    });
  });

  describe('starter tier reports', () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await createTestContext({ tier: 'starter', role: 'supervisor' });
    });

    it('allows report.generate for timesheets type', async () => {
      const result = await caller(ctx).report.generate({
        type: 'timesheets', dateRange: { from: '2026-10-01', to: '2026-10-11' }
      });
      expect(result.reportId).toBeDefined();
    });

    it('rejects report.generate for notes type with FORBIDDEN', async () => {
      await expect(
        caller(ctx).report.generate({
          type: 'notes', dateRange: { from: '2026-10-01', to: '2026-10-11' }
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        cause: { feature: 'reports', upgradeRequired: true },
      });
    });
  });

  describe('enabled_features override', () => {
    it('starter with charting override allows note.create', async () => {
      const ctx = await createTestContext({
        tier: 'starter',
        role: 'caregiver',
        enabledFeatures: ['charting'],
      });
      const result = await caller(ctx).note.create({ clientId: ctx.clientId, homeId: ctx.homeId, type: 'shift', content: {} });
      expect(result.status).toBe('draft');
    });
  });
});
```

### E2E Test Scenarios

```typescript
// tests/e2e/entitlements.spec.ts

import { test, expect } from '@playwright/test';

test.describe('entitlements E2E', () => {
  test('starter agency does not see charting nav item', async ({ page }) => {
    await loginAs(page, 'starter-caregiver@test.com');
    await expect(page.locator('nav')).not.toContainText('Charting');
    await expect(page.locator('nav')).not.toContainText('Medications');
    await expect(page.locator('nav')).not.toContainText('Incidents');
    await expect(page.locator('nav')).toContainText('Schedule');
    await expect(page.locator('nav')).toContainText('Timesheets');
  });

  test('starter agency cannot navigate to /charting directly', async ({ page }) => {
    await loginAs(page, 'starter-caregiver@test.com');
    await page.goto('/charting');
    await expect(page).toHaveURL('/dashboard'); // redirected
  });

  test('starter agency sees Reports nav (basic CSV)', async ({ page }) => {
    await loginAs(page, 'starter-supervisor@test.com');
    await expect(page.locator('nav')).toContainText('Reports');
    await expect(page.locator('nav')).not.toContainText('Analytics');
  });

  test('professional agency sees charting but not intake or analytics', async ({ page }) => {
    await loginAs(page, 'professional-supervisor@test.com');
    await expect(page.locator('nav')).toContainText('Charting');
    await expect(page.locator('nav')).toContainText('Medications');
    await expect(page.locator('nav')).not.toContainText('Intake');
    await expect(page.locator('nav')).not.toContainText('Analytics');
  });

  test('complete agency sees all nav items including analytics', async ({ page }) => {
    await loginAs(page, 'complete-admin@test.com');
    await expect(page.locator('nav')).toContainText('Schedule');
    await expect(page.locator('nav')).toContainText('Charting');
    await expect(page.locator('nav')).toContainText('Intake');
    await expect(page.locator('nav')).toContainText('Analytics');
    await expect(page.locator('nav')).toContainText('Reports');
  });

  test('upgrade modal shown to non-admin when gated tRPC call fails', async ({ page }) => {
    await loginAs(page, 'starter-caregiver@test.com');
    // The upgrade modal appears when a gated tRPC procedure returns FORBIDDEN
    // with upgradeRequired, NOT when navigating to a guarded route (which
    // redirects via layout guard). Test by triggering a gated call from a
    // non-gated page -- e.g., attempting to create a note from the dashboard.
    await page.goto('/dashboard');
    // Simulate triggering a gated procedure (e.g., via a deep link or API call)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test:trigger-gated-call', { detail: { feature: 'charting' } }));
    });
    await expect(page.locator('dialog')).toContainText('Feature Unavailable');
    await expect(page.locator('dialog')).toContainText('Ask your administrator');
    await expect(page.locator('dialog')).not.toContainText('Contact Support');
  });

  test('upgrade modal shown to admin with contact link', async ({ page }) => {
    await loginAs(page, 'starter-admin@test.com');
    await page.goto('/dashboard');
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('test:trigger-gated-call', { detail: { feature: 'charting' } }));
    });
    await expect(page.locator('dialog')).toContainText('Contact Support');
  });

  test('starter with charting override can access charting', async ({ page }) => {
    // Agency has enabled_features: ['charting']
    await loginAs(page, 'starter-override-caregiver@test.com');
    await expect(page.locator('nav')).toContainText('Charting');
    await page.goto('/charting');
    await expect(page).toHaveURL('/charting');
  });
});
```

### Test Data Seeding

Each test environment seeds three agencies with distinct tiers:

| Agency Slug | Tier | enabled_features | Users |
|-------------|------|-------------------|-------|
| `test-starter` | starter | `[]` | caregiver, supervisor, admin |
| `test-professional` | professional | `[]` | caregiver, supervisor, admin |
| `test-complete` | complete | `[]` | caregiver, supervisor, admin |
| `test-starter-override` | starter | `['charting']` | caregiver |

Tests never use production data. All test agencies, users, and clients are synthetic.
