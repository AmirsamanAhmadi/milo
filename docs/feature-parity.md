# Milo / JobOps feature coverage

Reviewed 8 October 2026 against upstream main and all 11 open pull requests. This is an implementation checklist, not a claim of production parity. Milo now has a separate live foundation with accounts, private persistence, applications, CV files/text, preferences and cover letters. The upstream comparison below tracks the original portable browser prototype and the remaining integration scope; see the README for current live status. See **More → Career toolkit → Feature coverage** for the visible status map.

## Implemented portable workflows

- Application list and board, per-job details, stages, follow-up dates, contact, salary, document versions and notes.
- Manual email ingestion, uncertain association review, linked Gmail/Outlook sample messages; reviewing mail never overwrites a manually selected stage.
- Search plans with terms, country, source, preset and result budget; UK-only source validation. Saving a plan does not run an extractor.
- Pasted-description job capture with HTTP(S) URL validation, normalized URLs, company/title duplicate detection and selected-job Ready/Skipped actions (100-record cap).
- Company board watchlists, 50-board limit, normalized-URL duplicate prevention and ignore/restore. No live refresh or new-opening counts.
- Per-job writing drafts, application stage distribution and source response counts with low-sample rate suppression.
- Role-specific interview study plans; light/dark appearance; member/admin visibility drafts.

## Remaining upstream scope

Backend implementation must cover discovered/processing/ready/applied/skipped/expired lifecycle; natural-language search planning, geographic radius, workplace and source filters; budget estimates, queue concurrency, cancellation, partial source failures, anti-bot browser recovery, backoff, deduplication, run history and correlation IDs.

Source adapters: LinkedIn, Indeed, Glassdoor (JobSpy), SEEK (Apify), Adzuna, Hiring Cafe, Jobindex, Gradcracker, UKVisaJobs, Startup Jobs, Working Nomads, Golang Jobs, FreeHire/OJCP and manual import; company boards Workday, BambooHR and Greenhouse. Verify extractor support before enabling a source. Source settings require encrypted credentials and readiness checks.

Resume Studio needs structured documents, imports, JSON export, profile/project editing, must-include/selectable/excluded project policies, autosave conflicts, AI field editing, Reactive Resume integration, tailoring, PDF cache invalidation, Tectonic/Typst rendering, classic/compact/clean-print themes and A4/Letter selection. Ghostwriter needs streamed per-job chat, minimized CV context, selected notes, tone/formality/language preferences, cancellation and regeneration.

Tracking needs read-only OAuth Gmail and Outlook/Live, provider-independent ingestion, classification confidence, review thresholds, orphan management, incremental sync and provider history. Add full text search, status aliases, command palette and shortcut help. Analytics needs time windows, funnel transitions, daily application counts and source cohorts.

Other services: UK/Canada/Netherlands/US sponsorship registers and update history; optional public CV-link tracer with bot filtering and privacy controls; provider/model routing, prompt templates, salary penalties and blocked companies; per-user tenancy, invitations, backups/retention, admin maintenance, secure service settings, production Docker persistence and authenticated OJCP capabilities. Hosted billing is not required for Milo's self-hosted deployment.

## Pull request review

Open proposals are tracked in [upstream-pull-requests.json](upstream-pull-requests.json), with direct upstream links:

- #362 URL ingestion and capture integrations; #513 Upwork extractor.
- #547 Outlook/O365; #761 IMAP tracking.
- #549 sidebar Typst theme and typography; #552 Codex document import; #641 draft Anthropic import fallback.
- #749 passkeys; #767 Google/GitHub/OIDC SSO. Keep automatic registration disabled: Milo remains invite-only. These require server validation and cannot be secured with browser role flags.
- #765 Cheaper Inference; #766 LiteLLM provider integration.

Relevant merged changes include #762 paper size, #758 member search permission, #750 clearing positive-response analytics after returning to Applied, #744 watchlist limit, #732 workspace tenancy and #769 Hiring Cafe challenge recovery. Open proposals must not be presented as merged upstream behavior.

## Validation and limits

Run `node scripts/build-preview.cjs` and `node tests/prototype.test.cjs`. New regression checks cover unsafe URLs, duplicate capture, bulk transitions, source/country compatibility, watchlist deduplication, escaped drafts and small-sample analytics. Automated checks use a simulated DOM; full browser/layout testing is still required. Standalone screens reset session edits when opened separately. No user data is synced, no application is submitted and no real account is created.
