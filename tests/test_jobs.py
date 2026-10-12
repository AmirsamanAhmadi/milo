import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json

spec = importlib.util.spec_from_file_location("jobs", Path(__file__).resolve().parents[1] / "src/server/jobs.py")
jobs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(jobs)


class JobProviderTests(unittest.TestCase):
    def test_seek_uses_nz_site_and_bounded_paid_run_without_token_in_url(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit):
                return json.dumps([{"id": "123", "title": "Engineer", "company": "Employer", "url": "https://www.seek.co.nz/job/123", "location": "Auckland"}]).encode()
        def open_request(request, timeout):
            self.assertNotIn("test-secret", request.full_url)
            self.assertIn("maxTotalChargeUsd=0.10", request.full_url)
            self.assertEqual(json.loads(request.data)["country"], "NZ")
            self.assertEqual(json.loads(request.data)["maxItems"], 20)
            return Response()
        with patch.dict(jobs.os.environ, {"APIFY_TOKEN": "test-secret"}), patch.object(jobs, "urlopen", open_request):
            result = jobs.fetch_seek({"country": "new zealand", "query": "engineer", "location": "Auckland"})
            self.assertEqual(len(result["jobs"]), 1)
            self.assertFalse(result["hasMore"])

    def test_jobspy_passes_country_and_pagination_and_deduplicates_results(self):
        class Frame:
            def to_json(self, **kwargs):
                import json
                row = {"title": "Engineer", "company": "Employer", "location": "Auckland",
                       "job_url": "https://www.linkedin.com/jobs/view/123", "is_remote": True,
                       "description": "<p>Python</p>", "job_type": "contract"}
                return json.dumps([row, row])
        captured = {}
        def scrape(**kwargs):
            captured.update(kwargs)
            return Frame()
        result = jobs.fetch_jobspy({"provider": "LinkedIn", "query": "python", "country": "new zealand", "page": 2}, scrape)
        self.assertEqual(captured["offset"], 20)
        self.assertEqual(captured["country_indeed"], "new zealand")
        self.assertEqual(len(result["jobs"]), 1)
        self.assertEqual(result["jobs"][0]["employment_type"], "Contract")
        self.assertNotIn("warning", result)

    def test_normalization_strips_html_and_preserves_location_restrictions(self):
        row = {"title": "Engineer", "company_name": "Company", "url": "https://www.arbeitnow.com/jobs/engineer",
               "location": "Germany only", "remote": True, "description": "<p>Build &amp; review</p>"}
        result = jobs.normalize(row, "Arbeitnow")
        self.assertEqual(result["description"], "Build & review")
        self.assertEqual(result["location"], "Germany only")
        self.assertTrue(result["remote"])
        self.assertIsNone(result["salary"])

    def test_unsafe_links_and_incomplete_jobs_are_not_imported(self):
        for url in ("javascript:alert(1)", "https://user:password@example.com", "http://example.com"):
            self.assertIsNone(jobs.normalize({"title": "Role", "company_name": "Company", "url": url}, "Arbeitnow"))
        self.assertIsNone(jobs.normalize({"url": "https://example.com"}, "Arbeitnow"))

    def test_adzuna_does_not_guess_salary_or_work_arrangement(self):
        result = jobs.normalize({"id": 1, "title": "Lead", "company": {"display_name": "Employer"},
                                 "location": {"display_name": "Auckland"}, "redirect_url": "https://www.adzuna.co.nz/job/1",
                                 "salary_min": 100000, "contract_type": "contract"}, "Adzuna NZ")
        self.assertIsNone(result["salary"])
        self.assertIsNone(result["remote"])
        self.assertEqual(result["employment_type"], "Contract")


if __name__ == "__main__":
    unittest.main()
