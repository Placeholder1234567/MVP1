"""Run: python -m unittest tools/prospecting/test_bay_area_homes.py (synthetic data only)."""
import csv
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bay_area_homes as m  # noqa: E402


class StatusTest(unittest.TestCase):
    def test_open_statuses(self):
        for s in ["LICENSED", "Licensed", "ACTIVE", "OPEN", "PENDING", "ON PROBATION", ""]:
            self.assertTrue(m.status_is_open(s), s)

    def test_closed_statuses_are_not_read_as_open(self):
        for s in ["INACTIVE", "UNLICENSED", "CLOSED", "REVOKED", "LICENSE REVOKED",
                  "SUSPENDED", "EXPIRED", "NOT ACTIVE INACTIVE", "WITHDRAWN"]:
            self.assertFalse(m.status_is_open(s), s)


class RowsTest(unittest.TestCase):
    def test_only_open_bay_area_rows_survive(self):
        rows = [
            ["Sunrise Home", "Jane Example", "ALAMEDA", "LICENSED"],
            ["Idle Home", "Old Owner", "ALAMEDA", "INACTIVE"],
            ["Unlicensed Home", "No Licence", "ALAMEDA", "UNLICENSED"],
            ["Closed Home", "Gone", "ALAMEDA", "CLOSED"],
            ["Far Home", "Far Owner", "FRESNO", "LICENSED"],
        ]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "ADULT_RESIDENTIAL_FACILITIES.csv"
            with open(path, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["Facility Name", "Licensee", "County Name", "Facility Status"])
                w.writerows(rows)
            out = m.rows_from_file(path, m.STATE_SOURCES[0], inspect=False)
        self.assertEqual([r["facility_name"] for r in out], ["Sunrise Home"])


if __name__ == "__main__":
    unittest.main()


class RealHeadersTest(unittest.TestCase):
    """Header names and type labels as they appear in the 2026 state files."""

    def write(self, d, name, header, rows):
        path = Path(d) / name
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)
        return path

    def test_cdph_owner_admin_email_and_types(self):
        header = ["FACID", "FACNAME", "FAC_FDR", "FAC_STATUS_TYPE_CODE", "CCN", "ADDRESS", "CITY", "ZIP",
                  "FACADMIN", "CONTACT_EMAIL", "CONTACT_PHONE_NUMBER", "COUNTY_NAME", "BUSINESS_NAME",
                  "LICENSE_STATUS_DESCRIPTION", "CAPACITY"]
        rows = [
            ["1", "MAPLE HOME", "INTERMEDIATE CARE FACILITY-DEVELOPMENTALLY DISABLED HABILITATIVE", "OPEN", "",
             "5 MAPLE CT", "SAN JOSE", "95112", "Ann Admin", "Ann@Maple.example", "4085550111", "SANTA CLARA",
             "Maple Homes Inc", "LICENSED", "6"],
            ["2", "BAYVIEW SNF", "SKILLED NURSING FACILITY", "OPEN", "055001", "10 BAY ST", "SAN FRANCISCO",
             "94110", "Bo Admin", "", "4155550199", "SAN FRANCISCO", "Bayview Care LLC", "LICENSED", "99"],
            ["3", "MISSION HOSPITAL", "GENERAL ACUTE CARE HOSPITAL", "OPEN", "", "1 HOSP WAY", "SAN JOSE",
             "95112", "", "", "4085550100", "SANTA CLARA", "Big Health", "LICENSED", "300"],
        ]
        with tempfile.TemporaryDirectory() as d:
            out = m.rows_from_file(self.write(d, "health_facility_locations.csv", header, rows),
                                   {"key": "cdph", "group": "health", "label": ""}, inspect=False)
        self.assertEqual([(r["facility_name"], r["group"]) for r in out],
                         [("Maple Home", "idd"), ("Bayview Snf", "nursing")])
        self.assertEqual(out[0]["licensee_owner"], "Maple Homes Inc")
        self.assertEqual(out[0]["administrator"], "Ann Admin")
        self.assertEqual(out[0]["email"], "ann@maple.example")
        self.assertEqual(out[1]["ccn"], "055001")

    def test_cdss_adult_file_types(self):
        header = ["facility_type", "facility_name", "licensee", "county_name", "facility_status"]
        rows = [
            ["ADULT RESIDENTIAL", "A", "x", "ALAMEDA", "LICENSED"],
            ["ENHANCED BEHAVIORAL SUPPORTS HOME - ARF", "B", "x", "ALAMEDA", "LICENSED"],
            ["ADULT DAY PROGRAM", "C", "x", "ALAMEDA", "LICENSED"],
            ["SOCIAL REHABILITATION FACILITY", "D", "x", "ALAMEDA", "LICENSED"],
            ["RESIDENTIAL FACILITY CHRONICALLY ILL", "E", "x", "ALAMEDA", "LICENSED"],
        ]
        with tempfile.TemporaryDirectory() as d:
            out = m.rows_from_file(self.write(d, "adult.csv", header, rows), m.STATE_SOURCES[0], inspect=False)
        self.assertEqual([r["group"] for r in out], ["idd", "idd", "day", "other", "other"])
