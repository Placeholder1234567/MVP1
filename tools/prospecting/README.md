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
