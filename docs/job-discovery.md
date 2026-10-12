# Job discovery in Milo

Reviewed Job-Ops at commit `cb8803c0566a1d8ec789f1f1ecf121f58ac8b769` on 12 October 2026. Its discovery layer uses a registry of source-specific extractors, configurable search terms and geography, normalized results, deduplication and per-source errors. The primary engines are [JobSpy](https://github.com/DaKheera47/job-ops/tree/cb8803c0566a1d8ec789f1f1ecf121f58ac8b769/extractors/jobspy) for Indeed/LinkedIn/Glassdoor, [Apify for SEEK](https://github.com/DaKheera47/job-ops/tree/cb8803c0566a1d8ec789f1f1ecf121f58ac8b769/extractors/seek), APIs for Adzuna and Working Nomads, and custom HTTP/browser extractors for other boards.

Milo implements its own Python adapters and uses the same independently distributed [JobSpy library](https://github.com/speedyapply/JobSpy). No Job-Ops source files are copied into Milo. Upstream Job-Ops has AGPLv3 plus Commons Clause notices in its [LICENSE](https://github.com/DaKheera47/job-ops/blob/cb8803c0566a1d8ec789f1f1ecf121f58ac8b769/LICENSE). JobSpy is MIT licensed; its installed package retains its license metadata in the container.

## Available sources

| Source | Method | Setup / limits |
| --- | --- | --- |
| Indeed | Python JobSpy | No key; NZ/Australia/UK/USA country selector; boards may block requests |
| LinkedIn | Python JobSpy | No key; include city and country in location; descriptions can be missing |
| Glassdoor | Python JobSpy | No key; choose a city and country; boards may block requests |
| Working Nomads | JSON search endpoint | No key; remote jobs with geographic restrictions |
| Arbeitnow | Public JSON feed | No key; primarily Europe; filters apply to a downloaded page |
| Adzuna NZ | Official API | Set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in ignored `.env` |
| SEEK | Apify actor | Set `APIFY_TOKEN`; NZ/Australia only; paid run, 20 results, US$0.10 charge cap, 20-second actor timeout |

Open **Opportunities** to search. **All available** queries Arbeitnow, Working Nomads, Indeed, LinkedIn, Glassdoor and configured Adzuna. It excludes SEEK to avoid launching paid runs as part of a combined search. Successful sources remain visible if another fails; warnings identify unavailable sources. URLs are deduplicated across sources, and an already saved URL opens its existing application. Review imported drafts before saving; work arrangement and employment type may need correction. Salary stays blank rather than treating foreign or predicted amounts as annual NZD salary.

Saving role preferences automatically opens Opportunities and searches all available sources with your saved keywords, location and remote preference. On a new browser session, opening Opportunities also initializes and runs that saved search when keywords are present. Comma-separated titles become alternative phrases for JobSpy. Salary, employment type and excluded-company preferences currently filter saved openings, as described on the preferences page. Live searches can still return zero results when filters are narrow or sources are blocked.

Searches require authentication and origin validation. Keywords are mandatory for JobSpy/combined searches. Each source has a 25-second subprocess limit; at most eight provider requests run concurrently. Results use a bounded 15-minute in-memory cache. The country selector applies to JobSpy Indeed/Glassdoor and SEEK; Adzuna remains NZ, and feed location filters match the listing text rather than proving eligibility. Pagination is limited to ten pages; SEEK returns one bounded batch. A provider may silently return no results when blocked, so zero results are not proof that no jobs exist.

## Python and Docker

The live image now uses Debian slim so JobSpy's native Python dependencies can use published wheels. JobSpy is pinned in `requirements.txt` and installed into `/opt/jobspy`; `MILO_PYTHON` points to its interpreter. The build/test stage remains Alpine and uses deterministic scraper fixtures without contacting providers. For direct local execution, use `python -m venv .venv`, install `python -m pip install -r requirements.txt` through that environment, and set `MILO_PYTHON` to its Python executable. No account cookies, passwords or proxy credentials are needed for these integrations.

SEEK follows [the actor's current input schema](https://apify.com/unfenced-group/seek-com-au-scraper/input-schema), explicitly setting `country=NZ` or `AU` and `maxItems=20`. Calls use bearer authorization and [Apify's synchronous dataset endpoint](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post). A failed/timed-out run may still consume provider credits up to the supplied cap. SEEK was tested with fixtures; a live run requires a configured Apify account. Adzuna live validation also requires credentials.

Custom browser scraping, Hiring Cafe, Startup Jobs, Gradcracker, UKVisaJobs, company-board watchlists, scheduled runs and AI ranking remain separate future work. No browser challenge-solving or automatic application submission is added here.

## CV assessment

CV studio shows a local completeness score from five checks: contact email, experience, skills, education/qualifications and a measurable achievement. Each check contributes 20 points. At least 30 words of readable text are needed. The score describes document completeness, not employability.

Each search result includes a keyword match score, recognized skill topics found in the CV, topics not found and short CV excerpts supporting the matches. The score is the matched-topic count divided by the listing's recognized-topic count. Listings need at least 20 description words and two recognized topics; otherwise the interface shows why a score is unavailable. This heuristic does not understand seniority, negation, years of experience, eligibility or every profession. It is not an AI assessment or a hiring probability.

Reviewed CV text takes precedence. If none is saved, the most recent uploaded PDF/DOCX/TXT is read locally using [pypdf](https://pypdf.readthedocs.io/en/stable/user/extract-text.html) and [python-docx](https://python-docx.readthedocs.io/en/latest/user/quickstart.html). Scanned PDFs require pasted text; no OCR is performed. Extraction runs in a bounded subprocess, with PDF page and Word archive-size limits. Saving reviewed text clears the current result scores so the next search recomputes them. CV content never goes to job providers and per-user scores are added after retrieving shared cached listings.

Successful JobSpy responses no longer carry a generic blocking warning. Combined searches still report individual source failures; paid SEEK notices remain visible.
