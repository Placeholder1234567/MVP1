#!/usr/bin/env python3
"""Daily refresh: download the state licensing lists and save them to Supabase.

Run by .github/workflows/prospecting-refresh.yml. It writes through two
database functions (supabase/ingest.sql) with the public anon key plus a
refresh token, the repository secret REFRESH_TOKEN, so no service-role key
is needed. The project URL and anon key are public and live in site/config.js.
Locally:

    REFRESH_TOKEN=... python sync_supabase.py --types idd,nursing

Homes that left the state list are marked still_listed = false (never
deleted, so your notes stay attached) only when every source downloaded
and some homes came back. Otherwise it saves what arrived and marks
nothing gone. Each run is recorded in refresh_log, which the site shows.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

import bay_area_homes as homes

FACT_FIELDS = [
    "facility_number", "facility_name", "facility_type", "grp", "licensee_owner", "cms_legal_business_name",
    "cms_owners", "administrator", "address", "city", "zip", "county", "phone", "email", "capacity",
    "license_status", "source",
]
BATCH = 500


def home_key(r: dict) -> str:
    # The state (CDSS) and CDPH numbers are separate ID systems.
    if r.get("facility_number"):
        return f"{r.get('source', '')}:{r['facility_number']}"
    return f"{homes.norm(r['facility_name'])}|{homes.norm(r['address'])}"


def to_row(r: dict, seen_at: str) -> dict:
    row = {f: str(r.get("group" if f == "grp" else f, "") or "") for f in FACT_FIELDS}
    row.update(home_key=home_key(r), still_listed=True, seen_at=seen_at)
    return row


def site_config() -> dict:
    """The public project URL and anon key the website uses (site/config.js)."""
    text = (Path(__file__).parent / "site" / "config.js").read_text()
    found = {k: re.search(rf"""["']?{k}["']?\s*:\s*["']([^"']+)["']""", text) for k in ("url", "anonKey")}
    if not all(found.values()):
        raise RuntimeError("site/config.js must set url and anonKey")
    return {k: m.group(1) for k, m in found.items()}


class Supabase:
    def __init__(self, url: str, anon_key: str, token: str, session: requests.Session | None = None):
        self.rpc = url.rstrip("/") + "/rest/v1/rpc/"
        self.token = token
        self.s = session or requests.Session()
        self.s.headers.update({"apikey": anon_key, "Authorization": f"Bearer {anon_key}",
                               "Content-Type": "application/json"})

    def _call(self, fn: str, body: dict, what: str) -> None:
        r = self.s.post(self.rpc + fn, json={"p_token": self.token, **body}, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase {what} failed: {r.status_code} {r.text[:300]}")

    def upsert_homes(self, rows: list[dict]) -> None:
        # Keyed rows: one home per key even if two files list it.
        unique = list({r["home_key"]: r for r in rows}.values())
        for i in range(0, len(unique), BATCH):
            self._call("ingest_homes", {"p_rows": unique[i:i + BATCH]}, "saving homes")

    def finish(self, groups: set[str], run_at: str, complete: bool, count: int, problems: list[str]) -> None:
        # Marks unseen homes as no longer listed only when complete, and logs the run.
        self._call("finish_refresh", {"p_groups": sorted(groups), "p_run_at": run_at, "p_complete": complete,
                                      "p_homes": count, "p_problems": "; ".join(problems)[:2000]},
                   "finishing the refresh")


def sync(db: Supabase, groups: set[str], cache: str = "downloads", collect=homes.collect) -> dict:
    run_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    found = collect(groups, cache=cache)
    problems = list(homes.PROBLEMS)
    complete = not problems and bool(found)
    if found:
        db.upsert_homes([to_row(r, run_at) for r in found])
    db.finish(groups, run_at, complete, len(found), problems or ([] if found else ["no homes came back"]))
    return {"complete": complete, "homes": len(found), "problems": problems}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--types", default=os.environ.get("REFRESH_TYPES") or "idd,nursing",
                    help="comma list of idd, nursing, elderly, day, other (default idd,nursing)")
    ap.add_argument("--cache", default="downloads")
    args = ap.parse_args()
    token = os.environ.get("REFRESH_TOKEN")
    if not token:
        print("Set REFRESH_TOKEN (the repository secret).", file=sys.stderr)
        return 2
    cfg = site_config()
    result = sync(Supabase(cfg["url"], cfg["anonKey"], token),
                  {t.strip() for t in args.types.split(",") if t.strip()}, args.cache)
    print(f"{'complete' if result['complete'] else 'INCOMPLETE'}: {result['homes']} homes"
          + (f"; problems: {'; '.join(result['problems'])}" if result["problems"] else ""))
    # A failed download fails the workflow run, so GitHub emails you.
    return 0 if result["complete"] else 1


if __name__ == "__main__":
    sys.exit(main())
