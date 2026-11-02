# Bay Area care-home lead list

`bay_area_homes.py` builds one spreadsheet of every licensed care home in the
nine Bay Area counties (Alameda, Contra Costa, Marin, Napa, San Francisco,
San Mateo, Santa Clara, Solano, Sonoma) for Guad outreach: calls, emails and
visits. It follows the dataqs-tracker approach: public government data, not
scraped websites.

| Source                                                 | Homes                                                                                                               | What it gives                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| CDSS Community Care Licensing (data.chhs.ca.gov)       | Adult residential facilities (DD group homes), ARFs for special health care needs, residential care for the elderly | Licensee (owner), administrator, address, phone, capacity, status |
| CDPH licensed healthcare facilities (data.chhs.ca.gov) | Skilled nursing, ICF, ICF/DD, ICF/DD-H, ICF/DD-N, congregate living                                                 | Licensee, address, phone, beds                                    |
| CMS Care Compare (data.cms.gov)                        | Medicare/Medicaid nursing homes                                                                                     | Legal business name, owners with 5%+ ownership or control         |
| Google Places + the home's own website (`--enrich`)    | Any                                                                                                                 | Website, published business email, rating                         |

## Run it

```bash
pip install requests
python bay_area_homes.py                    # everything; writes bay_area_care_homes.csv
python bay_area_homes.py --types idd        # Guad's core market: DD group homes + ICF/DD
GOOGLE_MAPS_API_KEY=... python bay_area_homes.py --types idd --enrich --limit 200
```

`--types` takes `idd`, `nursing` and `elderly` (RCFEs are by far the largest group).

If the state site changes its file names, download the CSVs by hand and use
`--from-dir`. CCLD's "Search for a Facility" site has a "Download Data" link
per facility type, and data.chhs.ca.gov has the CDPH listing. Then run
`--inspect` to see how each file's columns were read.

The output keeps empty tracker columns (status, first contact, visit date,
outcome, next step, notes). It can be loaded into the dataqs-tracker app with
a small change to its `seed_db.py`.

Tests (synthetic data only): `python -m unittest discover -s tools/prospecting`. GitHub runs them on every change here.

## The tracker website (free: GitHub + Supabase)

The list lives on a free website you can use on your phone. Each home shows
its owner, administrator, address, phone and email, with **Call**, **Email**
and **Directions** buttons. You can filter by type, county and outreach
status, and search across names, owners, cities and notes. Each home has
outreach fields you can edit: status, priority, the person you spoke to,
visit date, next step and notes. Nothing runs on a paid server:

- **GitHub Actions** runs `sync_supabase.py` every morning
  (`.github/workflows/prospecting-refresh.yml`). It downloads the state lists
  and saves them to Supabase. If any download fails, it saves what arrived,
  removes nothing, and the run fails so GitHub emails you.
- **Supabase** (free plan) stores the homes and your notes. Its database
  rules only let emails you list read anything.
- **GitHub Pages** hosts the site (`site/`,
  `.github/workflows/prospecting-site.yml`). You sign in with your email and a
  password.

### Setup

The Supabase project (`care-homes`) is already set up: `supabase/schema.sql`
(tables and access rules) and `supabase/ingest.sql` (the two functions the
refresh writes through) are applied, and `site/config.js` holds its public
URL and anon key. What's left is in GitHub:

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → New repository secret:**
   `REFRESH_TOKEN`, with the refresh token. It can only add homes and log
   refreshes; it can't read notes. To rotate it, store a new token's SHA-256
   with the statement at the end of `supabase/ingest.sql`.
3. **Actions → Prospecting site → Run workflow**. The run shows the site's
   address. Then **Actions → Prospecting refresh → Run workflow** for the
   first load; after that it runs every morning on its own.
4. On the site, enter your email and a password and tap **Create account**,
   then tap the confirmation link Supabase emails you (the page it opens may
   not load; the account is confirmed anyway) and sign in. Only emails in
   `allowed_users` see the list; add one with
   `insert into public.allowed_users (email) values ('them@example.com');`.

Optional repository variables: `REFRESH_TYPES` (default `idd,nursing`; add
`elderly` for assisted living) and `CONTACT_EMAIL` (sent to the state sites
as a courtesy).

## Before you reach out

- **Emails:** the state lists don't publish owner emails. `--enrich` only
  collects addresses a business puts on its own website. Cold email must follow
  CAN-SPAM: say who you are, give a physical address, and honour opt-outs.
- **Small homes are people's homes:** a 4–6 bed adult residential facility is
  where residents with disabilities live, and the licensee often lives
  elsewhere. Call first and ask for a time to meet; don't drop in unannounced.
  Larger SNFs and ICFs have front desks and business hours.
- **Keep the list private:** it holds names and phone numbers. `.gitignore`
  keeps the CSVs out of git.
