#!/usr/bin/env node
/**
 * Mechanical linter for Guad architecture specs.
 * Adapted from KEEL's lintSot — zero LLM, pure regex parsing.
 * Checks cross-document consistency between schema.ts, rls.sql, and all .md files.
 *
 * Usage: node .specify/lint.js
 */

const fs = require("fs");
const path = require("path");

const SD = path.join(__dirname);

function read(filename) {
  try { return fs.readFileSync(path.join(SD, filename), "utf8"); } catch { return ""; }
}

// ─── Parse schema.ts: extract every table name and its columns ───────────────

function parseSchema(schema) {
  const tables = new Map();
  const allCols = new Set();
  const definedConsts = new Set();
  const sqlNames = [];

  const headerRe = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*['"]([^'"]+)['"]\s*,\s*\{/g;
  let m;
  while ((m = headerRe.exec(schema))) {
    definedConsts.add(m[1]);
    sqlNames.push(m[2]);

    const start = m.index + m[0].length;
    let depth = 1, end = start;
    while (end < schema.length && depth > 0) {
      if (schema[end] === "{") depth++;
      else if (schema[end] === "}") depth--;
      end++;
    }
    const block = schema.slice(start, end - 1);
    const cols = new Set();
    const colRe = /(?:^|\n)\s*(\w+)\s*:\s*\w+(?:\(\s*['"]([^'"]+)['"])?/g;
    let c;
    while ((c = colRe.exec(block))) {
      cols.add(c[1]);
      allCols.add(c[1]);
      if (c[2]) { cols.add(c[2]); allCols.add(c[2]); }
    }
    tables.set(m[2], cols);
  }

  return { tables, allCols, definedConsts, sqlNames };
}

// ─── Parse enum values from schema.ts ────────────────────────────────────────

function parseEnums(schema) {
  const enums = new Map();
  const enumRe = /export\s+const\s+(\w+)\s*=\s*pgEnum\(\s*['"]([^'"]+)['"]\s*,\s*\[([\s\S]*?)\]\s*\)/g;
  let m;
  while ((m = enumRe.exec(schema))) {
    const values = [];
    const valRe = /['"]([^'"]+)['"]/g;
    let v;
    while ((v = valRe.exec(m[3]))) values.push(v[1]);
    enums.set(m[2], values);
  }
  return enums;
}

// ─── Lint checks ─────────────────────────────────────────────────────────────

function lint() {
  const issues = [];
  const seen = new Set();
  const push = (i) => {
    const key = i.artifact + "|" + i.check + "|" + i.message;
    if (!seen.has(key)) { seen.add(key); issues.push(i); }
  };

  const schema = read("schema.ts");
  const rls = read("rls.sql");
  const constitution = read("constitution.md");
  const security = read("security.md");
  const services = read("services.md");
  const trpcRouter = read("trpc-router.md");
  const agents = read("AGENTS.md");
  const claudeMd = read("../CLAUDE.md") || read("CLAUDE.md");  // moved to the repo root
  const offlineSync = read("offline-sync.md");
  const notifications = read("notifications.md");
  const chartingUx = read("charting-ux.md");

  if (!schema.trim()) {
    push({ artifact: "schema.ts", check: "exists", message: "schema.ts is missing or empty." });
    return issues;
  }

  const { tables, allCols, definedConsts, sqlNames } = parseSchema(schema);
  const enums = parseEnums(schema);
  const tableNames = [...tables.keys()];

  // ─── 1. FK Resolution: every .references() target must exist ───────────
  for (const m of schema.matchAll(/\.references\(\(\)\s*=>\s*(\w+)(?:\.[\w$]+)?\)/g)) {
    if (!definedConsts.has(m[1]))
      push({ artifact: "schema.ts", check: "fk-resolves",
        message: `.references(() => ${m[1]}) points to a table not defined in schema.ts.` });
  }

  // ─── 2. Every table must have agency_id ────────────────────────────────
  for (const [tbl, cols] of tables) {
    if (tbl === "agencies") continue;
    if (!cols.has("agency_id") && !cols.has("agency"))
      push({ artifact: "schema.ts", check: "agency-id-required",
        message: `Table '${tbl}' is missing agency_id column (constitution principle #1).` });
  }

  // ─── 3. Every table must have created_at, updated_at ──────────────────
  for (const [tbl, cols] of tables) {
    if (!cols.has("created_at"))
      push({ artifact: "schema.ts", check: "timestamps",
        message: `Table '${tbl}' is missing created_at column.` });
    if (tbl === "audit_log") continue;
    if (!cols.has("updated_at"))
      push({ artifact: "schema.ts", check: "timestamps",
        message: `Table '${tbl}' is missing updated_at column.` });
  }

  // ─── 4. RLS: every table must have at least one policy ─────────────────
  if (!rls.trim()) {
    push({ artifact: "rls.sql", check: "exists", message: "rls.sql is missing or empty." });
  } else {
    for (const t of sqlNames) {
      if (!new RegExp("\\b" + t + "\\b", "i").test(rls))
        push({ artifact: "rls.sql", check: "rls-coverage",
          message: `Table '${t}' has no RLS policy in rls.sql.` });
    }

    // ─── 5. RLS column references must exist in schema ───────────────────
    const tableNamesSet = new Set(tableNames);
    const qRe = new RegExp("\\b(" + tableNames.join("|") + ")\\.([a-z_][a-z0-9_]*)\\b", "g");
    let q;
    while ((q = qRe.exec(rls))) {
      const tCols = tables.get(q[1]);
      if (tCols && !tCols.has(q[2])) {
        push({ artifact: "rls.sql", check: "rls-columns-sync",
          message: `rls.sql references ${q[1]}.${q[2]} but that column is not in schema.ts.` });
      }
    }

    // ─── 6. RLS: check ENABLE ROW LEVEL SECURITY for each table ─────────
    for (const t of sqlNames) {
      if (!new RegExp("alter\\s+table\\s+(?:public\\.)?" + t + "\\s+enable\\s+row\\s+level\\s+security", "i").test(rls))
        push({ artifact: "rls.sql", check: "rls-enable",
          message: `Table '${t}' is missing ALTER TABLE ... ENABLE ROW LEVEL SECURITY in rls.sql.` });
    }
  }

  // ─── 7. Required tables for IDD healthcare domain ─────────────────────
  const REQUIRED = [
    "agencies", "profiles", "homes", "clients", "client_health_info",
    "goals", "medications", "notes", "note_goals", "incidents",
    "mar_records", "health_entries", "attendance", "clock_records",
    "schedule_slots", "coverage_requests", "audit_log"
  ];
  for (const t of REQUIRED) {
    if (!tableNames.includes(t))
      push({ artifact: "schema.ts", check: "required-tables",
        message: `IDD healthcare domain requires table '${t}' — not found in schema.ts.` });
  }

  // ─── 8. audit_log must exist and be append-only ───────────────────────
  if (!tableNames.includes("audit_log"))
    push({ artifact: "schema.ts", check: "audit-table",
      message: "Constitution requires an audit trail but no audit_log table found." });

  // ─── 9. Roles table must exist ────────────────────────────────────────
  if (!tableNames.includes("profiles") && !tableNames.includes("user_roles"))
    push({ artifact: "schema.ts", check: "roles-table",
      message: "RLS role checks need profiles or user_roles table — none found." });

  // ─── 10. Doc column sync: table.column refs in docs must exist ────────
  for (const [filename, content] of [
    ["security.md", security], ["services.md", services],
    ["trpc-router.md", trpcRouter], ["AGENTS.md", agents],
    ["CLAUDE.md", claudeMd]
  ]) {
    if (!content.trim()) continue;
    const docRe = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g;
    let d;
    while ((d = docRe.exec(content))) {
      if (tables.has(d[1]) && !tables.get(d[1]).has(d[2])) {
        // Skip common false positives (file extensions, tRPC method names, common words)
        const SKIP_COLS = new Set([
          "md", "ts", "sql", "yaml", "json", "txt", "js", "svelte", "toml", "css",
          "list", "get", "create", "update", "delete", "save", "send", "stop",
          "accept", "decline", "acknowledge", "review", "approve", "sign",
          "generate", "download", "record", "draft", "summarize", "transcribe",
          "clockIn", "clockOut", "callout", "postOpen", "setSlot", "clearSlot",
          "markRead", "sendBack", "createReferral", "listReferrals", "updateReferral",
          "listRooms", "updateRoom", "overview", "coverage", "documentation", "care",
          "me", "updateProfile", "listTemplates", "recordEffect",
        ]);
        if (SKIP_COLS.has(d[2])) continue;
        push({ artifact: filename, check: "doc-columns-sync",
          message: `${filename} references ${d[1]}.${d[2]} but that column is not in schema.ts.` });
      }
    }
  }

  // ─── 11. Charting preset enum must include 'therap' and 'default' ─────
  const presetEnum = enums.get("charting_preset");
  if (presetEnum) {
    if (!presetEnum.includes("therap"))
      push({ artifact: "schema.ts", check: "preset-values",
        message: "charting_preset enum missing 'therap' value." });
    if (!presetEnum.includes("default"))
      push({ artifact: "schema.ts", check: "preset-values",
        message: "charting_preset enum missing 'default' value." });
  } else {
    push({ artifact: "schema.ts", check: "preset-enum",
      message: "No charting_preset enum found in schema.ts." });
  }

  // ─── 12. Offline sync: referenced tables must exist ───────────────────
  if (offlineSync.trim()) {
    const syncTableRe = /\b([a-z_][a-z0-9_]*)\b/g;
    const syncTables = new Set();
    let st;
    while ((st = syncTableRe.exec(offlineSync))) {
      if (tableNames.includes(st[1])) syncTables.add(st[1]);
    }
    // Check that core sync tables are mentioned
    for (const t of ["notes", "mar_records", "health_entries", "attendance", "incidents", "clock_records"]) {
      if (tableNames.includes(t) && !syncTables.has(t))
        push({ artifact: "offline-sync.md", check: "sync-coverage",
          message: `Core table '${t}' should be in offline sync rules but is not mentioned in offline-sync.md.` });
    }
    // Check audit_log is NOT synced
    if (offlineSync.includes("audit_log") && !/never\s+sync|not\s+sync|server.only/i.test(
      offlineSync.slice(Math.max(0, offlineSync.indexOf("audit_log") - 100),
                        offlineSync.indexOf("audit_log") + 100)))
      push({ artifact: "offline-sync.md", check: "audit-not-synced",
        message: "audit_log should never sync to client — verify it's in the 'never synced' section." });
  }

  // ─── 13. Services: owned tables must exist in schema ──────────────────
  if (services.trim()) {
    const ownedRe = /[Oo]wns?\s*(?:tables?)?\s*:\s*`?([a-z_][a-z0-9_, `]*)/g;
    let ow;
    while ((ow = ownedRe.exec(services))) {
      const tbls = ow[1].split(/[,\s]+/).map(t => t.replace(/`/g, "").trim()).filter(Boolean);
      for (const t of tbls) {
        if (t.length > 2 && !tableNames.includes(t) && !/^and$|^the$|^no$|^its$/.test(t))
          push({ artifact: "services.md", check: "service-tables",
            message: `services.md says a service owns '${t}' but that table is not in schema.ts.` });
      }
    }
  }

  // ─── 14. AGENTS.md should not reference raw artifact names ────────────
  if (agents.trim()) {
    const rawNames = /\b(prd\.md|architecture\.md)\b/g;
    if (rawNames.test(agents))
      push({ artifact: "AGENTS.md", check: "path-discipline",
        message: "AGENTS.md references raw artifact names (prd.md/architecture.md) — use exported repo paths." });
  }

  // ─── 15. Notification types should reference valid event patterns ─────
  if (notifications.trim()) {
    const notifTypes = [];
    const typeRe = /\|\s*([a-z_]+)\s*\|/g;
    let nt;
    while ((nt = typeRe.exec(notifications))) {
      if (nt[1] !== "type" && nt[1].length > 3) notifTypes.push(nt[1]);
    }
    // Check notifications table exists
    if (!tableNames.includes("notifications"))
      push({ artifact: "notifications.md", check: "notif-table",
        message: "notifications.md defines notification types but no 'notifications' table in schema.ts." });
  }

  // ─── 16. Constitution compliance: check key requirements ──────────────
  if (constitution.trim()) {
    if (!/agency_id/i.test(constitution))
      push({ artifact: "constitution.md", check: "constitution-tenant",
        message: "Constitution should mention agency_id for tenant isolation." });
    if (!/HIPAA|hipaa/i.test(constitution))
      push({ artifact: "constitution.md", check: "constitution-hipaa",
        message: "Constitution should mention HIPAA compliance." });
    if (!/offline/i.test(constitution))
      push({ artifact: "constitution.md", check: "constitution-offline",
        message: "Constitution should mention offline-first principle." });
    if (!/audit/i.test(constitution))
      push({ artifact: "constitution.md", check: "constitution-audit",
        message: "Constitution should mention audit logging." });
  }

  // ─── 17. security.md must exist ───────────────────────────────────────
  if (!security.trim())
    push({ artifact: "security.md", check: "exists", message: "security.md is missing or empty." });

  // ─── 18. trpc-router.md must exist ────────────────────────────────────
  if (!trpcRouter.trim())
    push({ artifact: "trpc-router.md", check: "exists", message: "trpc-router.md is missing or empty." });

  return issues;
}

// ─── Run and report ──────────────────────────────────────────────────────────

const issues = lint();

console.log("\n  GUAD SPEC LINTER");
console.log("  ────────────────\n");

if (issues.length === 0) {
  console.log("  ✓ ALL CHECKS PASSED\n");
} else {
  console.log(`  ${issues.length} issue(s) found:\n`);
  const byArtifact = new Map();
  for (const i of issues) {
    if (!byArtifact.has(i.artifact)) byArtifact.set(i.artifact, []);
    byArtifact.get(i.artifact).push(i);
  }
  for (const [artifact, items] of byArtifact) {
    console.log(`  ${artifact} (${items.length}):`);
    for (const i of items) {
      console.log(`    [${i.check}] ${i.message}`);
    }
    console.log();
  }
}

process.exit(issues.length > 0 ? 1 : 0);
