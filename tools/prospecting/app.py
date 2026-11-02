"""Bay Area care-home outreach tracker: the lead list as a phone-friendly site.

Same shape as dataqs-tracker: one Flask file, SQLite on a Railway volume
(DATA_DIR), PIN login. "Refresh data" re-pulls the state licensing lists on
the server (bay_area_homes.collect) and merges them in, keeping every status,
note and visit you've recorded.

Run locally:  pip install -r requirements.txt && python app.py
Railway:      root directory tools/prospecting, volume mounted at /data,
              variables DATA_DIR=/data and APP_PIN=<your PIN>.
"""
from __future__ import annotations

import csv
import io
import json
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone

from flask import Flask, Response, jsonify, redirect, render_template_string, request, session

import bay_area_homes as homes

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DATA_DIR", HERE)
os.makedirs(DATA, exist_ok=True)
DB = os.path.join(DATA, "homes.db")
SECRET_FILE = os.path.join(DATA, "secret.json")
CACHE = os.path.join(DATA, "downloads")

# Facts from the state lists (replaced on refresh) and your outreach fields
# (never touched by a refresh).
FACT_FIELDS = [
    "facility_number", "facility_name", "facility_type", "grp", "licensee_owner", "cms_legal_business_name",
    "cms_owners", "administrator", "address", "city", "zip", "county", "phone", "email", "capacity",
    "license_status", "source",
]
TRACK_FIELDS = ["status", "priority", "contact_name", "contact_email", "first_contact", "last_contact",
                "visit_date", "outcome", "next_step", "notes"]
STATUSES = ["New", "Called - no answer", "Called - spoke", "Left message", "Emailed", "Visit planned",
            "Visited", "Interested", "Demo booked", "Not interested", "Do not contact"]
PRIORITIES = ["", "A - hot", "B - warm", "C - later"]
GROUPS = {"idd": "DD group homes & ICF/DD", "nursing": "Nursing homes", "elderly": "Assisted living (RCFE)",
          "day": "Adult day programs", "other": "Other"}
PAGE_SIZE = 100


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


with db() as _c:
    _c.execute(
        "CREATE TABLE IF NOT EXISTS homes (id INTEGER PRIMARY KEY AUTOINCREMENT, home_key TEXT UNIQUE, "
        + ", ".join(f"{f} TEXT DEFAULT ''" for f in FACT_FIELDS + TRACK_FIELDS)
        + ", still_listed INTEGER DEFAULT 1, updated_at TEXT DEFAULT '')"
    )
    _c.execute("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")

if not os.path.exists(SECRET_FILE):
    with open(SECRET_FILE, "w") as f:
        json.dump({"pin": str(secrets.randbelow(900000) + 100000), "flask_key": secrets.token_hex(32)}, f)
with open(SECRET_FILE) as f:
    _sec = json.load(f)
if os.environ.get("APP_PIN"):
    _sec["pin"] = os.environ["APP_PIN"].strip()
else:
    print(f"tracker PIN: {_sec['pin']} (set APP_PIN to choose your own)", flush=True)

app = Flask(__name__)
app.secret_key = _sec["flask_key"]
app.permanent_session_lifetime = timedelta(days=60)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_SECURE=bool(os.environ.get("RAILWAY_ENVIRONMENT")))


def meta(k: str, v: str | None = None) -> str:
    with db() as c:
        if v is not None:
            c.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (k, v))
            return v
        row = c.execute("SELECT v FROM meta WHERE k = ?", (k,)).fetchone()
        return row["v"] if row else ""


# ---------------------------------------------------------------- refresh

_refresh_lock = threading.Lock()


def home_key(r: dict) -> str:
    # State and CDPH numbers are separate ID systems, so the source is part of the key.
    if r.get("facility_number"):
        return f"{r.get('source', '')}:{r['facility_number']}"
    return f"{homes.norm(r['facility_name'])}|{homes.norm(r['address'])}"


def refresh(types: set[str]) -> None:
    if not _refresh_lock.acquire(blocking=False):
        return
    try:
        meta("refresh_state", "running")
        rows = homes.collect(types, cache=CACHE)
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with db() as c:
            c.execute("UPDATE homes SET still_listed = 0 WHERE grp IN (%s)" % ",".join("?" * len(types)),
                      sorted(types))
            for r in rows:
                vals = {f: str(r.get("group" if f == "grp" else f, "") or "") for f in FACT_FIELDS}
                key = home_key(r)
                c.execute(
                    "INSERT INTO homes (home_key, status, still_listed, updated_at, " + ", ".join(FACT_FIELDS)
                    + ") VALUES (?, 'New', 1, ?, " + ", ".join("?" * len(FACT_FIELDS)) + ") "
                    "ON CONFLICT(home_key) DO UPDATE SET still_listed = 1, updated_at = excluded.updated_at, "
                    + ", ".join(f"{f} = excluded.{f}" for f in FACT_FIELDS),
                    [key, now, *vals.values()],
                )
        meta("refreshed_at", now)
        meta("refresh_state", f"done: {len(rows)} homes")
    except Exception as e:  # shown on the page; the old list stays
        meta("refresh_state", f"failed: {type(e).__name__}: {e}"[:300])
    finally:
        _refresh_lock.release()


# ---------------------------------------------------------------- auth

_attempts: dict[str, list[float]] = {}


@app.before_request
def gate():
    if request.endpoint in ("login", "health"):
        return None
    if not session.get("ok"):
        return redirect("/login")
    if request.method == "POST" and request.headers.get("X-Requested-With") != "tracker" \
            and request.endpoint != "logout":
        return "Bad request", 400  # same-site form/JS only
    return None


@app.route("/health")
def health():
    return "ok"


@app.route("/login", methods=["GET", "POST"])
def login():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    err = False
    if request.method == "POST":
        cnt, t0 = _attempts.get(ip, [0, time.time()])
        if time.time() - t0 > 900:
            cnt, t0 = 0, time.time()
        if cnt >= 5:
            return "Too many attempts. Try again in 15 minutes.", 429
        if secrets.compare_digest(request.form.get("pin", "").strip(), str(_sec["pin"])):
            _attempts.pop(ip, None)
            session.permanent = True
            session["ok"] = True
            return redirect("/")
        _attempts[ip] = [cnt + 1, t0]
        err = True
    return render_template_string(LOGIN_PAGE, err=err)


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect("/login")


# ---------------------------------------------------------------- pages

def filtered(args) -> tuple[str, list]:
    where, params = ["1=1"], []
    if args.get("q"):
        like = f"%{args['q'].strip()}%"
        where.append("(facility_name LIKE ? OR licensee_owner LIKE ? OR administrator LIKE ? OR city LIKE ? "
                     "OR address LIKE ? OR notes LIKE ? OR cms_owners LIKE ?)")
        params += [like] * 7
    for field, arg in (("county", "county"), ("grp", "group"), ("status", "status"), ("priority", "priority")):
        if args.get(arg):
            where.append(f"{field} = ?")
            params.append(args[arg])
    if args.get("email") == "1":
        where.append("(email != '' OR contact_email != '')")
    if args.get("gone") != "1":
        where.append("still_listed = 1")
    return " AND ".join(where), params


ORDER = {"name": "facility_name", "city": "county, city, facility_name", "beds": "CAST(capacity AS INTEGER) DESC",
         "recent": "last_contact DESC, facility_name"}


@app.route("/")
def index():
    where, params = filtered(request.args)
    order = ORDER.get(request.args.get("sort", "city"), ORDER["city"])
    page = max(1, int(request.args.get("page", 1) or 1))
    with db() as c:
        total = c.execute(f"SELECT COUNT(*) FROM homes WHERE {where}", params).fetchone()[0]
        rows = [dict(r) for r in c.execute(
            f"SELECT * FROM homes WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?",
            [*params, PAGE_SIZE, (page - 1) * PAGE_SIZE])]
        counties = [r[0] for r in c.execute("SELECT DISTINCT county FROM homes WHERE county != '' ORDER BY 1")]
        by_status = dict(c.execute("SELECT status, COUNT(*) FROM homes WHERE still_listed = 1 GROUP BY 1").fetchall())
        empty = c.execute("SELECT COUNT(*) FROM homes").fetchone()[0] == 0
    return render_template_string(
        PAGE, rows=rows, total=total, page=page, pages=max(1, -(-total // PAGE_SIZE)), args=request.args,
        counties=counties, statuses=STATUSES, priorities=PRIORITIES, groups=GROUPS, by_status=by_status,
        empty=empty, refreshed=meta("refreshed_at"), state=meta("refresh_state"),
        running=_refresh_lock.locked(), track=TRACK_FIELDS)


@app.route("/refresh", methods=["POST"])
def start_refresh():
    types = {t for t in request.form.getlist("types") if t in GROUPS} or {"idd", "nursing"}
    threading.Thread(target=refresh, args=(types,), daemon=True).start()
    return jsonify(ok=True)


@app.route("/update", methods=["POST"])
def update():
    d = request.get_json(force=True)
    field = d.get("field")
    if field not in TRACK_FIELDS:
        return jsonify(error="field not editable"), 400
    value = str(d.get("value", ""))[:4000]
    today = datetime.now().strftime("%Y-%m-%d")
    with db() as c:
        c.execute(f"UPDATE homes SET {field} = ? WHERE id = ?", (value, int(d["id"])))
        if field == "status" and value not in ("", "New"):
            c.execute("UPDATE homes SET last_contact = ?, first_contact = CASE WHEN first_contact = '' "
                      "THEN ? ELSE first_contact END WHERE id = ?", (today, today, int(d["id"])))
    return jsonify(ok=True)


@app.route("/export.csv")
def export():
    where, params = filtered(request.args)
    with db() as c:
        rows = c.execute(f"SELECT * FROM homes WHERE {where} ORDER BY county, city, facility_name", params).fetchall()
    out = io.StringIO()
    w = csv.writer(out)
    cols = FACT_FIELDS + TRACK_FIELDS
    w.writerow(cols)
    for r in rows:
        w.writerow([r[c] for c in cols])
    return Response("﻿" + out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=bay_area_care_homes.csv"})


LOGIN_PAGE = """<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<title>Care homes</title><style>body{font-family:system-ui;background:#0f1d33;color:#fff;display:grid;
place-items:center;min-height:100vh;margin:0}form{background:#1b2c48;padding:28px;border-radius:14px;
width:260px}input,button{width:100%;box-sizing:border-box;font-size:18px;padding:12px;border-radius:9px;
border:0;margin-top:10px}button{background:#f6c445;font-weight:700}</style>
<form method=post><h3 style=margin:0>Bay Area care homes</h3>
<input name=pin type=password inputmode=numeric autofocus placeholder=PIN autocomplete=current-password>
<button>Open</button>{% if err %}<p style=color:#ff9b9b>Wrong PIN</p>{% endif %}</form>"""

PAGE = r"""<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>Bay Area care homes</title>
<style>
:root{--bg:#f4f6fa;--card:#fff;--ink:#14213d;--mut:#64708a;--line:#e3e7ef;--acc:#1f4fd1;--warm:#f6c445}
@media (prefers-color-scheme:dark){:root{--bg:#0f1624;--card:#18223a;--ink:#e8ecf5;--mut:#9aa6bf;--line:#2a3654;--acc:#7da2ff}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:10px 14px}
h1{font-size:18px;margin:0 0 8px}form.f{display:flex;flex-wrap:wrap;gap:6px}
input,select,textarea,button{font:inherit;font-size:15px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink)}
input[name=q]{flex:1 1 100%}form.f select{flex:1 1 30%}button{cursor:pointer}
.btn{background:var(--acc);color:#fff;border:0;font-weight:600}.sub{color:var(--mut);font-size:13px}
main{padding:12px;max-width:900px;margin:auto}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
.top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.name{font-weight:700;font-size:17px}
.pill{font-size:12px;padding:2px 8px;border-radius:99px;background:var(--line);white-space:nowrap}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.acts a{flex:1 1 30%;text-align:center;text-decoration:none;
background:var(--bg);border:1px solid var(--line);color:var(--ink);padding:10px 6px;border-radius:10px;font-weight:600;font-size:14px}
dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:8px 0;font-size:14px}dt{color:var(--mut)}dd{margin:0;overflow-wrap:anywhere}
details summary{cursor:pointer;color:var(--acc);font-weight:600;font-size:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.grid label{font-size:12px;color:var(--mut)}.grid input,.grid select,.grid textarea{width:100%}.full{grid-column:1/-1}
.stats{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.saved{color:#2a9d55;font-size:12px}
nav{display:flex;justify-content:space-between;align-items:center;margin:12px 0}
</style></head><body>
<header><h1>Bay Area care homes <span class=sub>{{ total }} shown</span></h1>
<form class=f method=get>
<input name=q value="{{ args.get('q','') }}" placeholder="Search name, owner, city, notes" type=search>
<select name=group onchange=this.form.submit()><option value="">All types</option>
{% for k,v in groups.items() %}<option value="{{k}}" {{'selected' if args.get('group')==k}}>{{v}}</option>{% endfor %}</select>
<select name=county onchange=this.form.submit()><option value="">All counties</option>
{% for c in counties %}<option {{'selected' if args.get('county')==c}}>{{c}}</option>{% endfor %}</select>
<select name=status onchange=this.form.submit()><option value="">Any status</option>
{% for s in statuses %}<option {{'selected' if args.get('status')==s}}>{{s}}</option>{% endfor %}</select>
<select name=sort onchange=this.form.submit()>
{% for k,v in [('city','By city'),('name','By name'),('beds','Most beds'),('recent','Recent contact')] %}
<option value="{{k}}" {{'selected' if args.get('sort','city')==k}}>{{v}}</option>{% endfor %}</select>
<label class=sub><input type=checkbox name=email value=1 {{'checked' if args.get('email')=='1'}} onchange=this.form.submit()> has email</label>
<button class=btn>Search</button></form></header>
<main>
<div class=card><div class=sub>
{% if running %}Refreshing from the state lists… reload in a minute.{% elif refreshed %}Data from the state lists, {{ refreshed[:10] }}. {{ state }}{% else %}No data yet.{% endif %}
</div>
<form id=rf class=stats>
{% for k,v in groups.items() if k!='other' %}<label class=sub><input type=checkbox name=types value="{{k}}" {{'checked' if k in ('idd','nursing')}}> {{v}}</label>{% endfor %}
<button type=button class=btn onclick="refreshData()" {{'disabled' if running}}>Refresh data</button>
<a class=sub href="/export.csv?{{ request.query_string.decode() }}">Download CSV</a></form>
<div class=stats>{% for s,n in by_status.items() if s %}<span class=pill>{{s}}: {{n}}</span>{% endfor %}</div></div>
{% if empty %}<div class=card>Tap <b>Refresh data</b> to load every licensed home. The first load takes a minute or two.</div>{% endif %}
{% for r in rows %}<div class=card id="h{{r.id}}">
<div class=top><div><div class=name>{{ r.facility_name }}</div><div class=sub>{{ r.facility_type }}{% if r.capacity %} · {{ r.capacity }} beds{% endif %}</div></div>
<span class=pill>{{ r.status or 'New' }}</span></div>
<div class=acts>
{% if r.phone %}<a href="tel:{{ r.phone|replace(' ','')|replace('(','')|replace(')','')|replace('-','') }}">Call</a>{% endif %}
{% set em = r.contact_email or r.email %}{% if em %}<a href="mailto:{{ em.split(';')[0] }}">Email</a>{% endif %}
<a target=_blank rel=noopener href="https://www.google.com/maps/dir/?api=1&destination={{ (r.address ~ ', ' ~ r.city ~ ' CA ' ~ r.zip)|urlencode }}">Directions</a></div>
<dl><dt>Owner</dt><dd>{{ r.licensee_owner or '—' }}{% if r.cms_legal_business_name and r.cms_legal_business_name != r.licensee_owner %} ({{ r.cms_legal_business_name }}){% endif %}</dd>
{% if r.cms_owners %}<dt>Owners</dt><dd>{{ r.cms_owners }}</dd>{% endif %}
<dt>Administrator</dt><dd>{{ r.administrator or '—' }}</dd>
<dt>Address</dt><dd>{{ r.address }}, {{ r.city }} {{ r.zip }} · {{ r.county }}</dd>
<dt>Phone</dt><dd>{{ r.phone or '—' }}</dd><dt>Email</dt><dd>{{ r.email or '—' }}</dd>
{% if not r.still_listed %}<dt>Note</dt><dd>No longer on the state list</dd>{% endif %}</dl>
<details {{'open' if r.notes or r.status not in ('','New')}}><summary>Outreach</summary><div class=grid>
<div><label>Status</label><select data-id="{{r.id}}" data-f=status>{% for s in statuses %}<option {{'selected' if r.status==s}}>{{s}}</option>{% endfor %}</select></div>
<div><label>Priority</label><select data-id="{{r.id}}" data-f=priority>{% for p in priorities %}<option {{'selected' if r.priority==p}}>{{p}}</option>{% endfor %}</select></div>
<div><label>Person you spoke to</label><input data-id="{{r.id}}" data-f=contact_name value="{{r.contact_name}}"></div>
<div><label>Their email</label><input type=email data-id="{{r.id}}" data-f=contact_email value="{{r.contact_email}}"></div>
<div><label>Visit date</label><input type=date data-id="{{r.id}}" data-f=visit_date value="{{r.visit_date}}"></div>
<div><label>Last contact</label><input type=date data-id="{{r.id}}" data-f=last_contact value="{{r.last_contact}}"></div>
<div class=full><label>Next step</label><input data-id="{{r.id}}" data-f=next_step value="{{r.next_step}}"></div>
<div class=full><label>Notes</label><textarea rows=3 data-id="{{r.id}}" data-f=notes>{{r.notes}}</textarea></div>
</div><span class=saved></span></details></div>{% endfor %}
<nav>{% if page>1 %}<a href="?{{ args|qs(page=page-1) }}">← Previous</a>{% else %}<span></span>{% endif %}
<span class=sub>Page {{page}} of {{pages}}</span>
{% if page<pages %}<a href="?{{ args|qs(page=page+1) }}">Next →</a>{% else %}<span></span>{% endif %}</nav>
<form method=post action=/logout><button class=sub style=border:0;background:none>Log out</button></form>
</main>
<script>
const H={'Content-Type':'application/json','X-Requested-With':'tracker'};
document.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('change',async()=>{
  const r=await fetch('/update',{method:'POST',headers:H,body:JSON.stringify({id:el.dataset.id,field:el.dataset.f,value:el.value})});
  const s=el.closest('details').querySelector('.saved');s.textContent=r.ok?'Saved':'Not saved — check your connection';
  if(el.dataset.f==='status')el.closest('.card').querySelector('.pill').textContent=el.value;}));
async function refreshData(){const fd=new FormData(document.getElementById('rf'));
  await fetch('/refresh',{method:'POST',headers:{'X-Requested-With':'tracker'},body:fd});setTimeout(()=>location.reload(),1500);}
</script></body></html>"""


@app.template_filter("qs")
def qs(args, **changes):
    from urllib.parse import urlencode
    d = {k: v for k, v in args.items()}
    d.update({k: str(v) for k, v in changes.items()})
    return urlencode(d)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
