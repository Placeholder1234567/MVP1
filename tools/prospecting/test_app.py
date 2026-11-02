"""Tracker website tests with the state download stubbed (synthetic data only).

Run: python -m unittest discover -s tools/prospecting (needs flask, requests).
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
_tmp = tempfile.TemporaryDirectory()
os.environ["DATA_DIR"] = _tmp.name  # app.py creates its database and secret here
os.environ["APP_PIN"] = "4321"
import app  # noqa: E402
import bay_area_homes as homes  # noqa: E402

H = {"X-Requested-With": "tracker"}


def tearDownModule():
    _tmp.cleanup()


def home(n, name, county="Alameda", email="", source="ccl_arf"):
    return dict(facility_number=str(n), source=source, facility_name=name, facility_type="Adult Residential",
                group="idd", licensee_owner=f"Owner {n}", administrator=f"Admin {n}", address=f"{n} Main St",
                city="Oakland", zip="94601", county=county, phone=f"(510) 555-01{n:02d}", email=email,
                capacity="6", license_status="Licensed")


SUNRISE, MAPLE, OAK = home(1, "Sunrise Home"), home(2, "Maple Home", "Santa Clara", "ann@maple.example"), \
    home(3, "Oak Home")


class TrackerTest(unittest.TestCase):
    def setUp(self):
        with app.db() as c:
            c.execute("DELETE FROM homes")
            c.execute("DELETE FROM meta")
        self.client = app.app.test_client()
        self.client.post("/login", data={"pin": "4321"})

    def load(self, rows, problems=()):
        def fake(types, cache=None):
            homes.PROBLEMS.clear()
            homes.PROBLEMS.extend(problems)
            return [dict(r) for r in rows]
        homes.collect = fake
        app.refresh({"idd"})

    def page(self, query=""):
        return self.client.get("/" + query).data.decode()

    def test_login_is_required_and_checked(self):
        anon = app.app.test_client()
        self.assertEqual(anon.get("/").status_code, 302)
        self.assertIn("Wrong PIN", anon.post("/login", data={"pin": "0000"}).data.decode())

    def test_posts_need_the_same_site_header(self):
        self.assertEqual(self.client.post("/refresh", data={"types": ["idd"]}).status_code, 400)

    def test_list_filters_and_actions(self):
        self.load([SUNRISE, MAPLE])
        t = self.page()
        self.assertIn("Sunrise Home", t)
        self.assertIn('href="tel:5105550101"', t)
        self.assertIn("mailto:ann@maple.example", t)
        self.assertNotIn("Maple Home", self.page("?county=Alameda"))
        self.assertNotIn("Sunrise Home", self.page("?email=1"))

    def test_outreach_edits_save_and_state_fields_are_refused(self):
        self.load([SUNRISE])
        with app.db() as c:
            hid = c.execute("SELECT id FROM homes").fetchone()[0]
        ok = self.client.post("/update", json={"id": hid, "field": "notes", "value": "Call back Tue"}, headers=H)
        self.assertEqual(ok.status_code, 200)
        self.client.post("/update", json={"id": hid, "field": "status", "value": "Called - spoke"}, headers=H)
        bad = self.client.post("/update", json={"id": hid, "field": "facility_name", "value": "x"}, headers=H)
        self.assertEqual(bad.status_code, 400)
        with app.db() as c:
            row = c.execute("SELECT * FROM homes").fetchone()
        self.assertEqual((row["notes"], row["status"]), ("Call back Tue", "Called - spoke"))
        self.assertTrue(row["first_contact"] and row["last_contact"])
        self.assertIn("Call back Tue", self.client.get("/export.csv").data.decode())

    def test_complete_refresh_keeps_notes_and_hides_homes_no_longer_listed(self):
        self.load([SUNRISE, MAPLE])
        with app.db() as c:
            c.execute("UPDATE homes SET notes = 'met owner'")
        self.load([SUNRISE])
        t = self.page()
        self.assertIn("met owner", t)
        self.assertNotIn("Maple Home", t)
        self.assertIn("Maple Home", self.page("?gone=1"))
        self.assertTrue(app.meta("refresh_state").startswith("done"))

    def test_failed_download_hides_nothing(self):
        self.load([SUNRISE, MAPLE])
        self.load([], problems=["ccl_arf: catalogue search failed (timeout)", "cdph: download failed"])
        t = self.page()
        self.assertIn("Sunrise Home", t)
        self.assertIn("Maple Home", t)
        self.assertIn("incomplete, nothing hidden", app.meta("refresh_state"))

    def test_partial_download_updates_what_arrived_and_hides_nothing(self):
        self.load([SUNRISE, MAPLE])
        changed = dict(SUNRISE, phone="(510) 555-0199")
        self.load([changed, OAK], problems=["cdph: download failed"])
        t = self.page()
        for name in ("Sunrise Home", "Maple Home", "Oak Home"):
            self.assertIn(name, t)
        self.assertIn("(510) 555-0199", t)
        self.assertIn("cdph: download failed", app.meta("refresh_state"))

    def test_empty_result_without_errors_hides_nothing(self):
        self.load([SUNRISE])
        self.load([])
        self.assertIn("Sunrise Home", self.page())
        self.assertIn("no homes came back", app.meta("refresh_state"))

    def test_same_number_in_two_state_lists_stays_two_homes(self):
        self.load([SUNRISE, dict(SUNRISE, source="cdph", facility_name="Other Agency Home")])
        with app.db() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM homes").fetchone()[0], 2)


class CollectProblemsTest(unittest.TestCase):
    def test_unreadable_file_is_recorded_as_a_problem(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, "mystery.csv").write_text("a,b\n1,2\n")
            homes.PROBLEMS.clear()
            homes.rows_from_file(Path(d, "mystery.csv"), homes.STATE_SOURCES[0], inspect=False)
        self.assertTrue(any("no county/name column" in p for p in homes.PROBLEMS))


if __name__ == "__main__":
    unittest.main()
