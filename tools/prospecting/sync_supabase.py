#!/usr/bin/env python3
"""Daily refresh: download the state licensing lists and save them to Supabase.

Run by .github/workflows/prospecting-refresh.yml with two repository
secrets, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Locally:

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python sync_supabase.py --types idd,nursing

Homes that left the state list are marked still_listed = false (never
deleted, so your notes stay attached) only when every source downloaded
and some homes came back. Otherwise it saves what arrived and marks
nothing gone. Each run is recorded in refresh_log, which the site shows.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

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


class Supabase:
    def __init__(self, url: str, key: str, session: requests.Session | None = None):
        self.base = url.rstrip("/") + "/rest/v1"
        self.s = session or requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

    def _check(self, r: requests.Response, what: str) -> None:
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase {what} failed: {r.status_code} {r.text[:300]}")

    def upsert_homes(self, rows: list[dict]) -> None:
        # Keyed rows: one home per key even if two files list it.
        unique = list({r["home_key"]: r for r in rows}.values())
        for i in range(0, len(unique), BATCH):
            r = self.s.post(f"{self.base}/homes", params={"on_conflict": "home_key"},
                            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                            json=unique[i:i + BATCH], timeout=120)
            self._check(r, "saving homes")

    def mark_gone(self, groups: set[str], seen_before: str) -> None:
        r = self.s.patch(f"{self.base}/homes",
                         params={"grp": f"in.({','.join(sorted(groups))})", "seen_at": f"lt.{seen_before}"},
                         headers={"Prefer": "return=minimal"}, json={"still_listed": False}, timeout=120)
        self._check(r, "marking homes no longer listed")

    def log(self, complete: bool, count: int, problems: list[str]) -> None:
        r = self.s.post(f"{self.base}/refresh_log", headers={"Prefer": "return=minimal"},
                        json={"complete": complete, "homes": count, "problems": "; ".join(problems)[:2000]},
                        timeout=60)
        self._check(r, "writing the refresh log")


def sync(db: Supabase, groups: set[str], cache: str = "downloads", collect=homes.collect) -> dict:
    run_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    found = collect(groups, cache=cache)
    problems = list(homes.PROBLEMS)
    complete = not problems and bool(found)
    if found:
        db.upsert_homes([to_row(r, run_at) for r in found])
    if complete:
        db.mark_gone(groups, run_at)
    db.log(complete, len(found), problems or ([] if found else ["no homes came back"]))
    return {"complete": complete, "homes": len(found), "problems": problems}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--types", default=os.environ.get("REFRESH_TYPES") or "idd,nursing",
                    help="comma list of idd, nursing, elderly, day, other (default idd,nursing)")
    ap.add_argument("--cache", default="downloads")
    args = ap.parse_args()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        return 2
    result = sync(Supabase(url, key), {t.strip() for t in args.types.split(",") if t.strip()}, args.cache)
    print(f"{'complete' if result['complete'] else 'INCOMPLETE'}: {result['homes']} homes"
          + (f"; problems: {'; '.join(result['problems'])}" if result["problems"] else ""))
    # A failed download fails the workflow run, so GitHub emails you.
    return 0 if result["complete"] else 1


if __name__ == "__main__":
    sys.exit(main())
