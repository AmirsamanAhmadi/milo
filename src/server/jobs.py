"""Fetch and normalize live job listings using Python's standard library."""
import json
import os
import re
import sys
from contextlib import redirect_stdout
from html import unescape
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


def plain(value, limit=30000):
    return unescape(re.sub(r"<[^>]*>", " ", str(value or "")))[:limit].strip()


def normalize(row, provider):
    adzuna = provider == "Adzuna NZ"
    url = str(row.get("redirect_url" if adzuna else "url", ""))
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    role = plain(row.get("title"), 200)
    company = plain((row.get("company") or {}).get("display_name") if adzuna else row.get("company_name"), 200)
    if not role or not company:
        return None
    return {"id": str(row.get("id" if adzuna else "slug", url))[:200],
            "role": role, "company": company,
            "location": plain((row.get("location") or {}).get("display_name") if adzuna else row.get("location"), 200),
            "remote": row.get("remote") is True if not adzuna else None,
            "url": url[:2000], "description": plain(row.get("description")),
            "source": provider, "salary": None,
            "published": str(row.get("created" if adzuna else "created_at", ""))[:40],
            "employment_type": "Contract" if row.get("contract_type") == "contract" else None}


def fetch_jobs(settings):
    provider = settings["provider"]
    if provider in ("Indeed", "LinkedIn", "Glassdoor"):
        return fetch_jobspy(settings)
    if provider == "Working Nomads":
        return fetch_nomads(settings)
    if provider == "SEEK":
        return fetch_seek(settings)
    if provider == "Adzuna NZ":
        app_id, app_key = os.environ.get("ADZUNA_APP_ID"), os.environ.get("ADZUNA_APP_KEY")
        if not app_id or not app_key:
            raise ValueError("Adzuna is not configured.")
        url = "https://api.adzuna.com/v1/api/jobs/nz/search/" + str(settings["page"]) + "?" + urlencode({
            "app_id": app_id, "app_key": app_key, "results_per_page": 20,
            "what": settings.get("query", ""), "where": settings.get("location", ""),
            "content-type": "application/json"})
    else:
        url = "https://www.arbeitnow.com/api/job-board-api?page=" + str(settings["page"])
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "Milo/0.1 job-search"})
    with urlopen(request, timeout=12) as response:
        contents = response.read(4 * 1024 * 1024 + 1)
    if len(contents) > 4 * 1024 * 1024:
        raise ValueError("Provider response is too large.")
    payload = json.loads(contents)
    rows = payload.get("results" if provider == "Adzuna NZ" else "data")
    if not isinstance(rows, list):
        raise ValueError("Invalid provider response.")
    jobs = [job for row in rows[:100] if isinstance(row, dict)
            for job in [normalize(row, provider)] if job]
    return {"jobs": jobs, "hasMore": bool(rows) if provider == "Adzuna NZ" else bool((payload.get("links") or {}).get("next"))}


def fetch_jobspy(settings, scraper=None):
    if scraper is None:
        from jobspy import scrape_jobs
        scraper = scrape_jobs
    # Suppress library stdout so this subprocess always returns one JSON document.
    with redirect_stdout(sys.stderr):
        frame = scraper(site_name=[settings["provider"].lower()],
                        search_term=" OR ".join('"' + term.strip().replace('"', '') + '"' for term in settings["query"].split(",") if term.strip()),
                        location=settings.get("location") or settings.get("country", "new zealand"),
                        country_indeed=settings.get("country", "new zealand"),
                        results_wanted=20, offset=(settings["page"] - 1) * 20,
                        is_remote=settings.get("remote", False),
                        description_format="html", verbose=0)
    rows = json.loads(frame.to_json(orient="records", date_format="iso"))
    results, seen = [], set()
    for row in rows[:20]:
        job = normalize({"id": row.get("id"), "title": row.get("title"),
                         "company_name": row.get("company"), "url": row.get("job_url"),
                         "location": row.get("location"), "description": row.get("description"),
                         "remote": row.get("is_remote"), "created_at": row.get("date_posted")}, settings["provider"])
        if job and job["url"] not in seen:
            job["remote"] = row.get("is_remote") if isinstance(row.get("is_remote"), bool) else None
            job["employment_type"] = {"fulltime": "Permanent", "parttime": "Part-time", "contract": "Contract", "internship": "Internship"}.get(row.get("job_type"))
            results.append(job)
            seen.add(job["url"])
    return {"jobs": results, "hasMore": len(rows) >= 20}


def fetch_nomads(settings):
    query = {"size": 20, "from": (settings["page"] - 1) * 20,
             "sort": [{"pub_date": {"order": "desc"}}]}
    if settings.get("query"):
        query["query"] = {"multi_match": {"query": settings["query"], "fields": ["title", "description", "company"]}}
    request = Request("https://www.workingnomads.com/jobsapi/_search", data=json.dumps(query).encode(),
                      headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Milo/0.1"})
    with urlopen(request, timeout=12) as response:
        contents = response.read(4 * 1024 * 1024 + 1)
    if len(contents) > 4 * 1024 * 1024:
        raise ValueError("Provider response too large.")
    hits = json.loads(contents).get("hits", {}).get("hits")
    if not isinstance(hits, list):
        raise ValueError("Invalid provider response.")
    results = []
    for hit in hits[:20]:
        row = hit.get("_source", {})
        slug = str(row.get("slug") or "")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", slug):
            continue
        location = row.get("locations") or row.get("location_base") or row.get("location") or "Not specified"
        if isinstance(location, list):
            location = ", ".join(str(item) for item in location)
        job = normalize({"id": row.get("id"), "title": row.get("title"), "company_name": row.get("company") or row.get("company_name"),
                         "url": "https://www.workingnomads.com/jobs/" + slug, "location": location,
                         "remote": True, "description": row.get("description"), "created_at": row.get("pub_date")}, "Working Nomads")
        if job:
            results.append(job)
    return {"jobs": results, "hasMore": len(hits) >= 20}


def fetch_seek(settings):
    token = os.environ.get("APIFY_TOKEN")
    if not token:
        raise ValueError("Apify is not configured.")
    country = "NZ" if settings["country"] == "new zealand" else "AU"
    url = "https://api.apify.com/v2/acts/unfenced-group~seek-com-au-scraper/run-sync-get-dataset-items?" + urlencode({
        "timeout": 20, "maxItems": 20, "maxTotalChargeUsd": "0.10", "limit": 20, "clean": "true"})
    request = Request(url, data=json.dumps({"searchQuery": settings["query"], "country": country,
                      "location": settings.get("location") or ("All New Zealand" if country == "NZ" else "All Australia"),
                      "maxItems": 20, "fetchDetails": False}).encode(),
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urlopen(request, timeout=23) as response:
        contents = response.read(4 * 1024 * 1024 + 1)
    if len(contents) > 4 * 1024 * 1024:
        raise ValueError("Provider response too large.")
    rows = json.loads(contents)
    if not isinstance(rows, list):
        raise ValueError("Invalid provider response.")
    results = []
    for row in rows[:20]:
        job = normalize({"id": row.get("id"), "title": row.get("title"), "company_name": row.get("company"),
                         "url": row.get("url"), "location": row.get("location"), "description": row.get("description"),
                         "remote": row.get("workArrangement") == "remote", "created_at": row.get("publishDate")}, "SEEK")
        if job:
            results.append(job)
    return {"jobs": results, "hasMore": False, "warning": "SEEK uses a paid Apify actor; this search is limited to 20 listings and a US$0.10 run cap. Descriptions may be incomplete."}


if __name__ == "__main__":
    try:
        print(json.dumps(fetch_jobs(json.load(sys.stdin)), ensure_ascii=True))
    except Exception:
        # Provider exception messages can contain API credentials in URLs.
        print("Job provider request failed.", file=sys.stderr)
        sys.exit(1)
