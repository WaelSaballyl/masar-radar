"""Pipeline tests: python -m unittest discover -s tests

Each test pins down a bug that once reached the data (see CLAUDE.md,
Invariants). Standard library only, and no network: the database lives in a
temporary folder.
"""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from radar import ai, collect, db, export_site, skills, store
from radar.sources import remoteok


class Skills(unittest.TestCase):
    def test_finds_the_usual_skills(self):
        found = skills.extract_skills("We need SQL, Python and Power BI; experience with R is a plus.")
        for name in ("SQL", "Python", "Power BI", "R"):
            self.assertIn(name, found)

    def test_one_letter_skill_is_not_found_inside_words(self):
        self.assertNotIn("R", skills.extract_skills("Research and reporting for the regional team"))

    def test_arabic_spelling_counts(self):
        self.assertIn("Python", skills.extract_skills("خبرة في بايثون"))

    def test_title_filter_keeps_data_roles_and_drops_the_lookalikes(self):
        self.assertTrue(skills.is_data_job("Data Analyst"))
        self.assertTrue(skills.is_data_job("Senior Data Engineer"))
        for title in ("KYC Analyst", "Compliance Analyst", "Sales Executive"):
            self.assertFalse(skills.is_data_job(title), title)

    def test_role_order_puts_the_specific_role_first(self):
        self.assertEqual(skills.classify_role("Senior Analytics Engineer"), "Analytics Engineer")
        self.assertEqual(skills.classify_role("Machine Learning Engineer"), "ML Engineer")

    def test_html_is_stripped_and_entities_decoded(self):
        text = skills.strip_html("<p>SQL &amp; Python</p>")
        self.assertIn("SQL & Python", text)
        self.assertNotIn("<p>", text)


class Sources(unittest.TestCase):
    def test_remoteok_mojibake_is_repaired_and_clean_text_left_alone(self):
        self.assertEqual(remoteok.repair("CafÃ© data"), "Café data")
        self.assertEqual(remoteok.repair("Plain text"), "Plain text")

    def test_repeats_inside_one_fetch_collapse(self):
        job = {"url": "https://x/1", "source": "s", "company": "C", "title": "T"}
        self.assertEqual(len(collect.dedupe([job, dict(job)])), 1)


class TempDatabase(unittest.TestCase):
    """A database and jsonl files in a temporary folder, never data/."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        folder = Path(self.tmp.name)
        self.saved = (db.DB_PATH, store.JOBS, store.DESCRIPTIONS)
        db.DB_PATH = folder / "radar.db"
        store.JOBS = folder / "jobs.jsonl"
        store.DESCRIPTIONS = folder / "descriptions.jsonl"

    def tearDown(self):
        db.DB_PATH, store.JOBS, store.DESCRIPTIONS = self.saved
        self.tmp.cleanup()

    def job(self, **extra):
        base = {"id": "j1", "source": "jobicy", "title": "Data Analyst", "company": "Acme",
                "location": "Riyadh", "role": "Data Analyst", "url": "https://x/1", "salary": "",
                "posted_at": "2026-09-01", "collected_at": "2026-09-01", "last_seen": "2026-09-01",
                "description": "SQL and Excel. Second line."}
        base.update(extra)
        return base

    def fingerprint(self):
        con = sqlite3.connect(db.DB_PATH)
        rows = con.execute("SELECT * FROM jobs ORDER BY id").fetchall()
        tags = con.execute("SELECT * FROM job_skills ORDER BY job_id, skill").fetchall()
        con.close()
        return rows, tags


class StorageRoundTrip(TempDatabase):
    """jsonl -> sqlite -> jsonl must lose nothing, U+2028 included."""

    def test_export_then_restore_is_lossless(self):
        con = db.connect()
        db.insert_job(con, self.job(), ["SQL", "Excel"])
        ai.store(con, {"id": "j1", "role": "Data Analyst", "seniority": "Junior",
                       "skills": [{"name": "SQL", "required": True}],
                       "countries": ["sa"], "regions": ["Middle East"], "work_mode": "onsite"},
                 "2026-09-02")
        con.commit()
        con.close()
        before = self.fingerprint()
        store.export()
        db.DB_PATH.unlink()
        store.restore()
        self.assertEqual(self.fingerprint(), before)
        # one record per line, whatever the description contains
        lines = store.JOBS.read_text(encoding="utf-8").split("\n")
        self.assertEqual(len([l for l in lines if l.strip()]), 1)

    def test_repeat_sighting_refreshes_last_seen_and_keeps_the_longer_text(self):
        con = db.connect()
        self.assertTrue(db.insert_job(con, self.job(description="long " * 50), []))
        self.assertFalse(db.insert_job(con, self.job(description="short", last_seen="2026-09-05"), []))
        last_seen, text = con.execute("SELECT last_seen, description FROM jobs").fetchone()
        con.close()
        self.assertEqual(last_seen, "2026-09-05")
        self.assertTrue(text.startswith("long"))


class AiAnswers(TempDatabase):
    """The model's answer is normalised before it is stored."""

    def test_countries_regions_and_mode_are_cleaned(self):
        con = db.connect()
        db.insert_job(con, self.job(), [])
        ai.store(con, {"id": "j1", "role": "Data Analyst",
                       "countries": ["uk", "DE", "EL", "Saudi", "de"],
                       "regions": ["Europe", "Mars"], "work_mode": "sometimes"}, "2026-09-02")
        row = con.execute("SELECT countries, regions, work_mode, ai_version FROM jobs").fetchone()
        con.close()
        self.assertEqual(row, ("DE,GB,GR", "Europe", "unknown", ai.PROMPT_VERSION))


class SiteData(unittest.TestCase):
    def test_one_employer_under_two_spellings(self):
        self.assertEqual(export_site._company("Tabby | تابي"), "تابي")
        self.assertEqual(export_site._company("Acme"), "Acme")

    def test_published_json_has_what_the_pages_read(self):
        docs = Path(__file__).resolve().parent.parent / "docs" / "data"
        summary = json.loads((docs / "summary.json").read_text(encoding="utf-8"))
        for key in ("updated_at", "active_postings", "route", "entry_jobs", "company_names", "jobs_basis"):
            self.assertIn(key, summary)
        postings = json.loads((docs / "jobs.json").read_text(encoding="utf-8"))["postings"]
        self.assertTrue(postings)
        for key in ("title", "company", "countries", "regions", "mode", "skills", "level", "role"):
            self.assertIn(key, postings[0])


if __name__ == "__main__":
    unittest.main()
