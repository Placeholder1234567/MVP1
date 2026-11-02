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
