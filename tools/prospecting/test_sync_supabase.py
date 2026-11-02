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
        self.db = sync.Supabase("https://x.supabase.co", "service-key", session=self.s)

    def calls(self, method, table):
        return [c for c in self.s.calls if c[0] == method and c[1].endswith("/" + table)]

    def test_complete_run_saves_marks_gone_and_logs(self):
        r = sync.sync(self.db, {"idd", "nursing"}, collect=collector([home(1), home(1, "cdph"), home(2)]))
        self.assertTrue(r["complete"])
        saved = self.calls("POST", "homes")[0][2]
        self.assertEqual(saved["params"], {"on_conflict": "home_key"})
        self.assertEqual({row["home_key"] for row in saved["json"]}, {"ccl_arf:1", "cdph:1", "ccl_arf:2"})
        self.assertEqual(saved["json"][0]["grp"], "idd")
        self.assertEqual(self.s.headers["Authorization"], "Bearer service-key")
        gone = self.calls("PATCH", "homes")[0][2]
        self.assertEqual(gone["params"]["grp"], "in.(idd,nursing)")
        self.assertTrue(gone["params"]["seen_at"].startswith("lt."))
        self.assertEqual(gone["json"], {"still_listed": False})
        self.assertEqual(self.calls("POST", "refresh_log")[0][2]["json"]["complete"], True)

    def test_failed_download_marks_nothing_gone(self):
        r = sync.sync(self.db, {"idd"}, collect=collector([], ["ccl_arf: catalogue search failed (timeout)"]))
        self.assertFalse(r["complete"])
        self.assertEqual(self.calls("PATCH", "homes"), [])
        self.assertEqual(self.calls("POST", "homes"), [])
        log = self.calls("POST", "refresh_log")[0][2]["json"]
        self.assertFalse(log["complete"])
        self.assertIn("timeout", log["problems"])

    def test_partial_download_saves_what_arrived_and_marks_nothing_gone(self):
        sync.sync(self.db, {"idd"}, collect=collector([home(1)], ["cdph: download failed"]))
        self.assertEqual(len(self.calls("POST", "homes")[0][2]["json"]), 1)
        self.assertEqual(self.calls("PATCH", "homes"), [])

    def test_empty_result_marks_nothing_gone(self):
        sync.sync(self.db, {"idd"}, collect=collector([]))
        self.assertEqual(self.calls("PATCH", "homes"), [])
        self.assertIn("no homes came back", self.calls("POST", "refresh_log")[0][2]["json"]["problems"])

    def test_large_lists_are_sent_in_batches(self):
        sync.sync(self.db, {"idd"}, collect=collector([home(n) for n in range(1201)]))
        self.assertEqual([len(c[2]["json"]) for c in self.calls("POST", "homes")], [500, 500, 201])

    def test_a_supabase_error_stops_the_run(self):
        class Bad(FakeResponse):
            status_code = 401
            text = "invalid key"
        self.s.post = lambda url, **kw: Bad()
        with self.assertRaisesRegex(RuntimeError, "401"):
            sync.sync(self.db, {"idd"}, collect=collector([home(1)]))


if __name__ == "__main__":
    unittest.main()
