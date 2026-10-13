# Company-only job search

Open **Find jobs → Live search** and select **Company websites only** in **Job source**. This is an optional, separate search mode; it is not mixed into **All available**. Results use the same CV ranking, sponsorship filtering, Save job, interview preparation and Job toolkit actions as other sources.

## Google discovery

An administrator can add a [Serper](https://serper.dev/) Google-results API key to the ignored `.env` file:

```dotenv
SERPER_API_KEY=YOUR_SEARCH_API_KEY
```

Rebuild/recreate the web service using `docker compose up --build -d`. The key stays server-side. Leave **Company career URLs** blank and enter a role, location and country. Each uncached discovery search requests one Google results page of up to ten links through Serper and then checks up to six eligible company sites. Search credits may be used. Results are cached for 15 minutes and repeated requests are throttled.

Google snippets are used only to discover URLs; they are never imported as job descriptions. The crawler reads the company page's published `JobPosting` structured data and extracts role, hiring organization, description, location, remote status, employment type, source URL and posting date. Known job-board domains are excluded, and employer association is checked against organization URLs/branding. Expired or incomplete postings are omitted. The source label records the employer hostname.

[Google's Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) is closed to new customers and retires for existing customers on January 1, 2027. This implementation therefore uses a configurable Google-results provider rather than requiring that legacy API. Serper discovery has fixture-based API tests; live Google discovery requires the administrator's own working key.

## Search without an API key

Paste up to six public HTTPS company career URLs, one per line. This searches those sites directly and does not call Google or spend search credits. You can paste an individual employer job page or a careers index; a bounded crawl follows relevant links on that employer's domain. Manual URL searches have one page.

**Include employer career portals linked from their website** optionally reads published Greenhouse and Lever job feeds. The portal must be linked by the employer's page and its company identifier must match the employer domain or its published organization identity. A Google result pointing only to an external portal is insufficient. Turn this option off to retain postings on employer website domains. Linked portals display a distinct source label and retain the originating company URL. Other portals, including Workday/Ashby, are currently not supported.

Locations and explicit remote-country requirements are filtered against the selected country when published. Unknown eligibility remains unverified; review the actual posting. Salary is not imported into application salary fields, because currencies and salary intervals vary. Saving a job requires the existing source review behavior.

## Limits and safety

The crawler uses selectable structured job data, not screenshots or speculative AI descriptions. Sites that render jobs only through JavaScript, do not publish job data, reject requests, or disallow crawling may yield no results. An empty result is not proof that no jobs exist. Crawl results are bounded to five pages per employer, two employer portals and 100 postings, with an overall time budget.

Only public HTTPS endpoints on port 443 are fetched. IP-literal, credential-bearing, private/reserved DNS destinations and known job-board URLs are rejected. Connections use the validated IP while checking TLS against the original hostname. Every redirect is validated again, and career pages respect their robots policy. API credentials are sent only to the fixed discovery endpoint. No user cookies, CVs or documents are sent to company sites or Google discovery; only the entered search keywords, location and country are sent to the search provider.

Sources: [Google JobPosting documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting), [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever published postings API](https://github.com/lever/postings-api).
