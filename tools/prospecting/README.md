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
  `.github/workflows/prospecting-site.yml`). You sign in with a link
  sent to your email.

### Setup (about 15 minutes, once)

1. **Supabase:** create a free project at supabase.com. Open **SQL Editor**
   and run `supabase/schema.sql`, then run
   `insert into public.allowed_users (email) values ('your@email');`.
2. **Supabase → Authentication → Users → Add user → Create new user:**
   add the same email and tick "Auto confirm". Sign-up for anyone else stays off.
3. **Supabase → Project Settings → API:** copy the **Project URL**, the
   **anon public** key and the **service_role** key.
4. **GitHub → this repo → Settings → Secrets and variables → Actions:**
   - Secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (keep the
     service key secret; it bypasses the database rules).
   - Variables: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public by design).
     Optional: `REFRESH_TYPES` (default `idd,nursing`; add `elderly` for
     assisted living) and `CONTACT_EMAIL` (sent to the state sites as a
     courtesy).
5. **GitHub → Settings → Pages → Source: GitHub Actions.**
6. **GitHub → Actions → Prospecting site → Run workflow.** It prints the
   site's address, `https://<your-user>.github.io/<repo>/`.
7. **Supabase → Authentication → URL Configuration:** set **Site URL** to
   that address, so sign-in links open the site.
8. **GitHub → Actions → Prospecting refresh → Run workflow** for the first
   load. After that it runs every morning on its own.

Open the site on your phone, enter your email and tap the link you get.
To keep it on your home screen, use Share → Add to Home Screen.

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
