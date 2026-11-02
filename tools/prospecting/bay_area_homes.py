#!/usr/bin/env python3
"""Bay Area care-home lead list for Guad outreach.

Builds one CSV of every licensed care home in the nine Bay Area counties,
with the licensee (owner), administrator, address, phone and capacity, from
the public licensing lists the state and CMS publish:

  * CDSS Community Care Licensing (data.chhs.ca.gov): adult residential
    facilities (group homes for adults with developmental disabilities),
    ARFs for persons with special health care needs, and residential care
    for the elderly (assisted living / board and care).
  * CDPH Licensed and Certified Healthcare Facilities (data.chhs.ca.gov):
    skilled nursing facilities, ICF/DD, ICF/DD-H and ICF/DD-N homes, and
    congregate living health facilities.
  * CMS Care Compare (data.cms.gov): for Medicare/Medicaid nursing homes,
    the legal business name and each owner with 5%+ ownership or control.

Optional enrichment (--enrich, needs GOOGLE_MAPS_API_KEY): looks each home up
on Google Places for its website, then reads the home page and contact page
for a published business email. It only reads what the business publishes;
it respects robots.txt and waits between requests.

Run it on your own computer (Python 3.9+, `pip install requests`):

    python bay_area_homes.py                      # all types, all 9 counties
    python bay_area_homes.py --types idd          # DD group homes + ICF/DD only
    python bay_area_homes.py --enrich             # + website and email
    python bay_area_homes.py --inspect            # show each file's columns
    python bay_area_homes.py --from-dir downloads # use CSVs you downloaded

Output: bay_area_care_homes.csv (one row per licensed home) with tracker
columns (status, notes...) left blank for your outreach.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import time
import urllib.robotparser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

DEFAULT_COUNTIES = frozenset({
    "ALAMEDA", "CONTRA COSTA", "MARIN", "NAPA", "SAN FRANCISCO",
    "SAN MATEO", "SANTA CLARA", "SOLANO", "SONOMA",
})
BAY_AREA_COUNTIES = set(DEFAULT_COUNTIES)

CKAN = "https://data.chhs.ca.gov/api/3/action/package_search"
CMS_METASTORE = "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items"
CMS_QUERY = "https://data.cms.gov/provider-data/api/1/datastore/query/{id}/0"
USER_AGENT = "GuadOutreachResearch/1.0 (contact: set GUAD_CONTACT_EMAIL)"

# State datasets: a CKAN search, then the CSV resources whose name matches.
# Resource URLs are looked up at run time, so a monthly refresh doesn't break
# the script. `group` decides --types filtering.
STATE_SOURCES = [
    {
        "key": "ccl_arf", "group": "idd", "label": "Adult Residential Facility",
        "query": "community care licensing facilities",
        "resource": r"adult residential(?! facility for persons)",
    },
    {
        "key": "ccl_rcfe", "group": "elderly", "label": "Residential Care for the Elderly",
        "query": "community care licensing facilities",
        "resource": r"residential care (facilities )?for the elderly|rcfe",
    },
    {
        "key": "cdph", "group": "health", "label": "",  # type comes from the row
        "query": "licensed and certified healthcare facility listing",
        "resource": r"facility locations|facility listing",
    },
]

def cdph_group(ftype: str) -> str | None:
    """CDPH facility types worth keeping (others are hospitals, clinics, labs).
    Matched on words, since the file spells ICF/DD types several ways."""
    t = (ftype or "").upper()
    if "INTERMEDIATE CARE" in t or t.startswith("ICF"):
        return "idd" if ("DEVELOPMENTAL" in t or re.search(r"\bDD", t)) else "nursing"
    if "SKILLED NURSING" in t or "CONGREGATE LIVING" in t or t in {"SNF", "CLHF"}:
        return "nursing"
    return None


def ccl_group(ftype: str, default: str) -> str:
    """CDSS adult files mix residential homes with other programs."""
    t = (ftype or "").upper()
    if "ADULT DAY" in t:
        return "day"
    if "SOCIAL REHAB" in t or "CHRONICALLY ILL" in t:
        return "other"
    if "ELDERLY" in t or "RCFE" in t:
        return "elderly"
    return default


# Column names differ between files and years; each field takes the first
# header that matches one of these (case-insensitive, punctuation ignored).
FIELDS = {
    "facility_number": ["facility number", "facility_number", "facid", "fac id", "license number", "facility id"],
    "name": ["facility name", "facname", "fac name", "name"],
    "type": ["facility type", "fac type", "fac_fdr", "facility type description", "ltc", "license type"],
    "licensee": ["licensee", "licensee name", "business name", "owner", "lic name"],
    "administrator": ["facility administrator", "facadmin", "administrator", "admin name", "contact name"],
    "email": ["contact email", "facility email", "email"],
    "ccn": ["ccn", "cms certification number"],
    "address": ["facility address", "address", "street address", "street"],
    "city": ["facility city", "city"],
    "zip": ["facility zip", "zip", "zip code", "zipcode"],
    "county": ["county name", "county"],
    "phone": ["facility telephone number", "telephone", "phone", "contact phone number", "phone number"],
    "capacity": ["facility capacity", "capacity", "bed capacity", "total beds", "beds"],
    "status": ["facility status", "license status description", "license status", "status"],
}


PROBLEMS: list[str] = []


def warn(msg: str) -> None:
    """A source that couldn't be read: printed, and recorded so callers can
    tell an incomplete download from a real change in the state list."""
    PROBLEMS.append(msg)
    print(f"  ! {msg}", file=sys.stderr)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def pick_columns(headers: list[str]) -> dict[str, str | None]:
    by_norm = {norm(h): h for h in headers}
    out: dict[str, str | None] = {}
    used: set[str] = set()
    # Exact matches first for every field, so a "contains" match below can't
    # take a column another field names exactly.
    for field, names in FIELDS.items():
        out[field] = next((by_norm[norm(n)] for n in names if norm(n) in by_norm), None)
        if out[field]:
            used.add(out[field])
    for field, names in FIELDS.items():
        if out[field]:
            continue
        for n in names:
            found = next((h for k, h in by_norm.items()
                          if norm(n) in k and h not in used
                          and (field == "phone" or "phone" not in k)), None)
            if found:
                out[field] = found
                used.add(found)
                break
    return out


def session() -> requests.Session:
    s = requests.Session()
    contact = os.environ.get("GUAD_CONTACT_EMAIL")
    s.headers["User-Agent"] = USER_AGENT.replace("set GUAD_CONTACT_EMAIL", contact) if contact else USER_AGENT
    return s


def ckan_csv_urls(s: requests.Session, query: str, resource_re: str) -> list[tuple[str, str]]:
    r = s.get(CKAN, params={"q": query, "rows": 20}, timeout=60)
    r.raise_for_status()
    found = []
    for pkg in r.json()["result"]["results"]:
        for res in pkg.get("resources", []):
            name = f"{res.get('name', '')} {res.get('description', '')}"
            if (res.get("format", "").upper() == "CSV" or res.get("url", "").lower().endswith(".csv")) and re.search(
                resource_re, name, re.I
            ):
                found.append((res["name"], res["url"]))
    # One file per resource name (the dataset lists newest first).
    seen, unique = set(), []
    for name, url in found:
        if name not in seen:
            seen.add(name)
            unique.append((name, url))
    return unique


def download(s: requests.Session, url: str, cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / re.sub(r"[^A-Za-z0-9._-]+", "_", urlparse(url).path.split("/")[-1] or "file.csv")
    if not path.exists():
        print(f"  downloading {url}", file=sys.stderr)
        with s.get(url, timeout=300, stream=True) as r:
            r.raise_for_status()
            with open(path, "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    f.write(chunk)
    return path


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    reader = csv.DictReader(io.StringIO(text))
    return list(reader.fieldnames or []), list(reader)


def clean_phone(p: str) -> str:
    d = re.sub(r"\D", "", p or "")
    if len(d) == 11 and d.startswith("1"):
        d = d[1:]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}" if len(d) == 10 else (p or "").strip()


OPEN_WORDS = {"LICENSED", "OPEN", "ACTIVE", "PENDING", "PROBATION", "CERTIFIED"}
CLOSED_WORDS = {
    "INACTIVE", "UNLICENSED", "CLOSED", "REVOKED", "SUSPENDED", "EXPIRED",
    "DENIED", "WITHDRAWN", "TERMINATED", "CANCELLED", "CANCELED", "SURRENDERED",
}


def status_is_open(status: str) -> bool:
    """Whether a licence status means the home is operating. Whole words
    only, so INACTIVE isn't read as ACTIVE nor UNLICENSED as LICENSED, and
    any closing word wins. A blank status (some files have none) is kept."""
    words = set(re.findall(r"[A-Z]+", (status or "").upper()))
    if not words:
        return True
    if words & CLOSED_WORDS:
        return False
    return bool(words & OPEN_WORDS)


def rows_from_file(path: Path, source: dict, inspect: bool) -> list[dict]:
    headers, rows = read_csv(path)
    cols = pick_columns(headers)
    if inspect:
        print(f"\n== {path.name} ({len(rows)} rows)\n   headers: {headers}")
        print("   mapped:  " + ", ".join(f"{k}={v!r}" for k, v in cols.items()))
        for f in ("type", "status"):
            if cols[f]:
                counts: dict[str, int] = {}
                for r in rows:
                    v = (r.get(cols[f]) or "").strip()
                    counts[v] = counts.get(v, 0) + 1
                top = sorted(counts.items(), key=lambda kv: -kv[1])[:20]
                print(f"   {f} values: " + "; ".join(f"{k or '(blank)'}={n}" for k, n in top))
    if not cols["county"] or not cols["name"]:
        warn(f"{path.name}: no county/name column found; run --inspect and add the header to FIELDS")
        return []
    out = []
    for r in rows:
        get = lambda f: (r.get(cols[f]) or "").strip() if cols[f] else ""  # noqa: E731
        county = get("county").upper().replace(" COUNTY", "")
        if county not in BAY_AREA_COUNTIES:
            continue
        status = get("status").upper()
        if not status_is_open(status):
            continue  # closed, revoked, inactive, unlicensed
        ftype = get("type") or source["label"]
        if source["key"] == "cdph":
            group = cdph_group(ftype)
            if not group:
                continue  # hospitals, clinics, etc.
        else:
            group = ccl_group(ftype, source["group"])
        out.append({
            "facility_number": get("facility_number"),
            "facility_name": get("name").title(),
            "facility_type": ftype.title() if ftype.isupper() else ftype,
            "group": group,
            "licensee_owner": get("licensee"),
            "administrator": get("administrator"),
            "address": get("address").title(),
            "city": get("city").title(),
            "zip": get("zip")[:5],
            "county": county.title(),
            "phone": clean_phone(get("phone")),
            "email": get("email").lower(),
            "ccn": get("ccn"),
            "capacity": get("capacity"),
            "license_status": status.title(),
            "source": source["key"],
        })
    return out


def cms_ownership(s: requests.Session, inspect: bool) -> dict[str, dict]:
    """CMS nursing homes in CA: legal business name and 5%+ owners, by CCN.

    Matched to state rows by phone and by address (CMS and CDPH use
    different facility IDs)."""
    try:
        resp = s.get(CMS_METASTORE, timeout=60)
        meta = resp.json()
    except ValueError:
        print(f"  ! CMS catalogue answered {resp.status_code} with non-JSON "
              f"({resp.text[:80]!r}); using the known dataset IDs", file=sys.stderr)
        meta = []

    def find(title_re):
        for d in meta:
            themes = " ".join(t.get("data", "") if isinstance(t, dict) else str(t) for t in d.get("theme", []))
            if re.search(title_re, d.get("title", ""), re.I) and "nursing" in themes.lower():
                return d["identifier"]
        return None

    # Fallback IDs: Nursing Home "Provider Information" and "Ownership".
    info_id = find(r"^provider information$") or "4pq5-n9py"
    own_id = find(r"^ownership$") or "y2hd-n93e"
    if not info_id or not own_id:
        print("  ! CMS: could not find the nursing home Provider Information / Ownership datasets", file=sys.stderr)
        return {}

    def query(ds):
        rows, offset = [], 0
        state_col = "state"
        while True:
            r = s.post(CMS_QUERY.format(id=ds), json={
                "conditions": [{"property": state_col, "value": "CA", "operator": "="}],
                "limit": 1500, "offset": offset}, timeout=120)
            if r.status_code == 400 and state_col == "state" and offset == 0:
                state_col = "provider_state"  # the ownership file names it differently
                continue
            if r.status_code != 200:
                raise ValueError(f"CMS dataset {ds} answered {r.status_code}: {r.text[:120]!r}")
            batch = r.json().get("results", [])
            rows += batch
            if len(batch) < 1500:
                return rows
            offset += 1500

    info, owners = query(info_id), query(own_id)
    if inspect and info:
        print(f"\n== CMS provider info columns: {list(info[0])}\n== CMS ownership columns: {list(owners[0]) if owners else []}")
    key = lambda d, *names: next((d[k] for k in d if norm(k) in {norm(n) for n in names}), "")  # noqa: E731
    by_ccn: dict[str, dict] = {}
    for p in info:
        ccn = key(p, "cms_certification_number_ccn", "federal_provider_number", "ccn")
        by_ccn[ccn] = {
            "legal_business_name": key(p, "legal_business_name"),
            "ownership_type": key(p, "ownership_type"),
            "phone": re.sub(r"\D", "", key(p, "telephone_number", "provider_phone_number", "phone_number")),
            "address": norm(key(p, "provider_address", "address")),
            "owners": [],
        }
    for o in owners:
        ccn = key(o, "cms_certification_number_ccn", "federal_provider_number", "ccn")
        if ccn in by_ccn:
            name = key(o, "owner_name")
            role = key(o, "role_played_by_owner_or_manager_in_facility", "role_desc", "role")
            pct = key(o, "ownership_percentage")
            if name:
                by_ccn[ccn]["owners"].append(f"{name} ({role}{', ' + pct if pct else ''})".replace("()", ""))
    return by_ccn


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
JUNK_EMAIL = re.compile(r"(example\.|sentry|wixpress|\.png|\.jpg|\.gif|@2x|domain\.com|email\.com)", re.I)


def places_lookup(s: requests.Session, key: str, row: dict) -> dict:
    q = f"{row['facility_name']} {row['address']} {row['city']} CA"
    r = s.post("https://places.googleapis.com/v1/places:searchText", json={"textQuery": q}, headers={
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri",
    }, timeout=30)
    if r.status_code != 200:
        return {}
    places = r.json().get("places") or []
    return places[0] if places else {}


def site_emails(s: requests.Session, url: str, robots: dict) -> list[str]:
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    if base not in robots:
        rp = urllib.robotparser.RobotFileParser(base + "/robots.txt")
        try:
            rp.read()
        except Exception:
            rp = None
        robots[base] = rp
    rp = robots[base]
    emails: list[str] = []
    for page in [url, urljoin(base, "/contact"), urljoin(base, "/contact-us")]:
        if rp and not rp.can_fetch(USER_AGENT, page):
            continue
        try:
            time.sleep(1.0)
            r = s.get(page, timeout=20)
            if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
                continue
            for e in EMAIL_RE.findall(r.text):
                e = e.strip(".").lower()
                if not JUNK_EMAIL.search(e) and e not in emails:
                    emails.append(e)
        except requests.RequestException:
            continue
        if emails:
            break
    return emails[:3]


OUT_COLUMNS = [
    "facility_name", "facility_type", "group", "licensee_owner", "cms_legal_business_name",
    "cms_owners", "cms_ownership_type", "administrator", "address", "city", "zip", "county",
    "phone", "website", "email", "google_rating", "google_reviews", "google_maps", "capacity",
    "license_status", "facility_number", "source",
    # outreach tracking (blank; fill in as you go)
    "status", "priority", "first_contact", "last_contact", "visit_date", "outcome", "next_step", "notes",
]


def collect(groups: set[str], counties: set[str] | None = None, from_dir: str | None = None,
            cache: str = "downloads", cms: bool = True, enrich: bool = False, limit: int = 0,
            inspect: bool = False) -> list[dict]:
    """Every licensed home of the given groups in the given counties, one row
    each. Used by the command line below. The website's daily refresh (supabase/refresh.sql) follows the same rules."""
    global BAY_AREA_COUNTIES
    PROBLEMS.clear()
    counties = counties or set(DEFAULT_COUNTIES)
    BAY_AREA_COUNTIES = {c.upper() for c in counties}
    s = session()

    rows: list[dict] = []
    if from_dir:
        for path in sorted(Path(from_dir).glob("*.csv")):
            name = path.name.lower()
            src = next((x for x in STATE_SOURCES if re.search(x["resource"], name.replace("_", " "), re.I)), None)
            src = src or {"key": "cdph" if "health" in name or "facility" in name else "ccl_arf",
                          "group": "idd", "label": ""}
            rows += rows_from_file(path, src, inspect)
    else:
        for src in STATE_SOURCES:
            if src["key"] == "ccl_rcfe" and "elderly" not in groups:
                continue  # the large elderly file is only needed for RCFEs
            try:
                urls = ckan_csv_urls(s, src["query"], src["resource"])
            except (requests.RequestException, ValueError, KeyError) as e:
                warn(f"{src['key']}: catalogue search failed ({e}); use --from-dir")
                continue
            if not urls:
                warn(f"{src['key']}: no CSV found; download it by hand and use --from-dir")
            for _, url in urls[:1]:
                try:
                    path = download(s, url, Path(cache))
                except requests.RequestException as e:
                    warn(f"{src['key']}: download failed ({e})")
                    continue
                rows += rows_from_file(path, src, inspect)

    rows = [r for r in rows if r["group"] in groups]
    # One row per home: the same home can appear in several files.
    seen, unique = set(), []
    for r in rows:
        k = (norm(r["facility_name"]), norm(r["address"]))
        if k not in seen:
            seen.add(k)
            unique.append(r)
    rows = unique
    print(f"{len(rows)} licensed homes in {', '.join(sorted(counties)).title()}", file=sys.stderr)

    if not not cms and not from_dir and groups & {"nursing", "idd"}:
        try:
            cms_rows = cms_ownership(s, inspect)
            by_phone = {v["phone"]: v for v in cms_rows.values() if v["phone"]}
            by_addr = {v["address"]: v for v in cms_rows.values() if v["address"]}
            matched = 0
            for r in rows:
                m = (cms_rows.get(r.get("ccn", "")) or by_phone.get(re.sub(r"\D", "", r["phone"]))
                     or by_addr.get(norm(r["address"])))
                if m:
                    matched += 1
                    r["cms_legal_business_name"] = m["legal_business_name"]
                    r["cms_ownership_type"] = m["ownership_type"]
                    r["cms_owners"] = "; ".join(m["owners"])
            print(f"CMS owner details matched for {matched} nursing homes", file=sys.stderr)
        except (requests.RequestException, ValueError, KeyError) as e:
            print(f"  ! CMS lookup failed ({e}); continuing without it", file=sys.stderr)

    if enrich:
        key = os.environ.get("GOOGLE_MAPS_API_KEY")
        if not key:
            print("  ! --enrich needs GOOGLE_MAPS_API_KEY; skipping", file=sys.stderr)
        else:
            robots: dict = {}
            todo = rows[: limit] if limit else rows
            for i, r in enumerate(todo, 1):
                p = places_lookup(s, key, r)
                r["website"] = p.get("websiteUri", "")
                r["google_rating"] = p.get("rating", "")
                r["google_reviews"] = p.get("userRatingCount", "")
                r["google_maps"] = p.get("googleMapsUri", "")
                if not r["phone"] and p.get("nationalPhoneNumber"):
                    r["phone"] = p["nationalPhoneNumber"]
                if r["website"] and not r.get("email"):
                    r["email"] = "; ".join(site_emails(s, r["website"], robots))
                if i % 25 == 0:
                    print(f"  enriched {i}/{len(todo)}", file=sys.stderr)

    rows.sort(key=lambda r: (r["county"], r["city"], r["facility_name"]))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--types", default="idd,nursing,elderly,day",
                    help="comma list of: idd (DD group homes, ICF/DD), nursing (SNF, ICF, CLHF), "
                         "elderly (RCFE), day (adult day programs), other (social rehab, chronically ill)")
    ap.add_argument("--counties", default=",".join(sorted(DEFAULT_COUNTIES)),
                    help="comma list of county names (default: the 9 Bay Area counties)")
    ap.add_argument("--from-dir", help="read CSVs you downloaded yourself instead of fetching (any file names)")
    ap.add_argument("--cache", default="downloads", help="where fetched CSVs are kept (default: downloads)")
    ap.add_argument("--no-cms", action="store_true", help="skip the CMS owner lookup")
    ap.add_argument("--enrich", action="store_true", help="Google Places website + published email (GOOGLE_MAPS_API_KEY)")
    ap.add_argument("--limit", type=int, default=0, help="enrich at most N homes (cost control)")
    ap.add_argument("--inspect", action="store_true", help="print each file's columns and how they were mapped")
    ap.add_argument("-o", "--out", default="bay_area_care_homes.csv")
    args = ap.parse_args()

    rows = collect({g.strip() for g in args.types.split(",") if g.strip()},
                   {c.strip() for c in args.counties.split(",") if c.strip()},
                   from_dir=args.from_dir, cache=args.cache, cms=not args.no_cms,
                   enrich=args.enrich, limit=args.limit, inspect=args.inspect)
    with open(args.out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({**{c: "" for c in OUT_COLUMNS}, **r, "status": "New"})
    print(f"wrote {args.out}", file=sys.stderr)
    by_type: dict[str, int] = {}
    for r in rows:
        by_type[r["facility_type"]] = by_type.get(r["facility_type"], 0) + 1
    print(json.dumps(by_type, indent=2), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
