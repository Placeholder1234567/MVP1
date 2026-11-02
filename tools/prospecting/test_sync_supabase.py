"""Daily Supabase sync with the download and Supabase both faked (synthetic data only)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bay_area_homes as homes  # noqa: E402
import sync_supabase as sync  # noqa: E402


class FakeResponse:
    status_code = 201
    text = ""


class FakeSession:
    def __init__(self):
        self.headers, self.calls = {}, []

    def post(self, url, **kw):
        self.calls.append(("POST", url, kw))
        return FakeResponse()

    def patch(self, url, **kw):
        self.calls.append(("PATCH", url, kw))
        return FakeResponse()


def home(n, source="ccl_arf"):
    return dict(facility_number=str(n), source=source, facility_name=f"Home {n}", facility_type="Adult Residential",
                group="idd", licensee_owner=f"Owner {n}", address=f"{n} Main St", city="Oakland", county="Alameda",
                phone="(510) 555-0101")


def collector(rows, problems=()):
    def collect(groups, cache=None):
        homes.PROBLEMS.clear()
        homes.PROBLEMS.extend(problems)
        return rows
    return collect


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.s = FakeSession()
        self.db = sync.Supabase("https://x.supabase.co", "anon-key", "refresh-token", session=self.s)

    def calls(self, fn):
        return [c[2]["json"] for c in self.s.calls if c[1].endswith("/rpc/" + fn)]

    def test_complete_run_saves_and_finishes_complete(self):
        r = sync.sync(self.db, {"idd", "nursing"}, collect=collector([home(1), home(1, "cdph"), home(2)]))
        self.assertTrue(r["complete"])
        saved = self.calls("ingest_homes")[0]
        self.assertEqual(saved["p_token"], "refresh-token")
        self.assertEqual({row["home_key"] for row in saved["p_rows"]}, {"ccl_arf:1", "cdph:1", "ccl_arf:2"})
        self.assertEqual(saved["p_rows"][0]["grp"], "idd")
        self.assertEqual(self.s.headers["apikey"], "anon-key")
        done = self.calls("finish_refresh")[0]
        self.assertEqual((done["p_groups"], done["p_complete"], done["p_homes"]), (["idd", "nursing"], True, 3))
        self.assertEqual(done["p_run_at"], saved["p_rows"][0]["seen_at"])

    def test_failed_download_saves_nothing_and_finishes_incomplete(self):
        r = sync.sync(self.db, {"idd"}, collect=collector([], ["ccl_arf: catalogue search failed (timeout)"]))
        self.assertFalse(r["complete"])
        self.assertEqual(self.calls("ingest_homes"), [])
        done = self.calls("finish_refresh")[0]
        self.assertFalse(done["p_complete"])
        self.assertIn("timeout", done["p_problems"])

    def test_partial_download_saves_what_arrived_and_finishes_incomplete(self):
        sync.sync(self.db, {"idd"}, collect=collector([home(1)], ["cdph: download failed"]))
        self.assertEqual(len(self.calls("ingest_homes")[0]["p_rows"]), 1)
        self.assertFalse(self.calls("finish_refresh")[0]["p_complete"])

    def test_empty_result_finishes_incomplete(self):
        sync.sync(self.db, {"idd"}, collect=collector([]))
        done = self.calls("finish_refresh")[0]
        self.assertFalse(done["p_complete"])
        self.assertIn("no homes came back", done["p_problems"])

    def test_large_lists_are_sent_in_batches(self):
        sync.sync(self.db, {"idd"}, collect=collector([home(n) for n in range(1201)]))
        self.assertEqual([len(c["p_rows"]) for c in self.calls("ingest_homes")], [500, 500, 201])

    def test_a_supabase_error_stops_the_run(self):
        class Bad(FakeResponse):
            status_code = 401
            text = "invalid refresh token"
        self.s.post = lambda url, **kw: Bad()
        with self.assertRaisesRegex(RuntimeError, "401"):
            sync.sync(self.db, {"idd"}, collect=collector([home(1)]))

    def test_public_settings_come_from_the_site_config(self):
        cfg = sync.site_config()
        self.assertTrue(cfg["url"].startswith("https://") and cfg["url"].endswith(".supabase.co"))
        self.assertTrue(cfg["anonKey"])


if __name__ == "__main__":
    unittest.main()
