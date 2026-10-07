# Milo — Build Plan

## Objective and current baseline

Turn the dependency-free screen prototype into a secure, invite-only application hosted through Docker on your own server. Keep the reviewed Milo interface and expand toward the JobOps coverage backlog.

Current baseline: a live Node service with persistent SQLite storage, real invite-only accounts, sessions, admin invitations, private applications and stage events, CV documents/text, preferences and cover letters. The original 30-screen prototype remains a separate design reference. Service tests cover isolated users, token expiry/reuse, origin checks, uploads and persistence; the browser script is exercised against the service through a simulated DOM. Real Docker startup and browser validation remain outstanding.

## Foundation implementation decision

The first slice uses dependency-free Node.js and SQLite rather than the initially proposed Next.js/PostgreSQL stack. This provides runnable persistence and tests within the current environment and one container, without scaffolding unused services. Node 24's built-in SQLite API remains experimental; pin the reviewed runtime for deployment. Revisit PostgreSQL and the worker architecture when background workloads and scale justify them. The stack below is the longer-term direction, not a list of installed dependencies.

The first usable foundation is implemented. Next: verify container startup and browser flows on the Docker host, add password change/recovery and account administration, then implement robust document parsing and Gmail/Outlook connections. No email or search integration is enabled yet.

## Longer-term architecture

Use TypeScript with Next.js for the web application and server API, PostgreSQL for persistent data, and a separate worker process for document parsing, mailbox synchronization, search extraction and AI tasks. Use a PostgreSQL-backed job queue initially so the first deployment does not require Redis. Store private documents in a mounted volume behind authorized download endpoints; add S3-compatible storage only if deployment needs it.

Run every Milo service through Docker Compose: web/API, worker, PostgreSQL, HTTPS ingress and backup jobs. Build tools, tests, migrations and administrator bootstrap commands also run in containers; the host requires only Docker/Compose. See [Container setup](containers.md) for the runnable preview configuration. Put HTTPS termination in front of the web service, keep the database private, and mount persistent database/document volumes. Pin supported dependency and image versions during implementation rather than guessing versions in this plan. Next.js supports self-hosted Node and Docker deployment: [official self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting), [Docker guide](https://docs.docker.com/guides/nextjs/).

Use an established authentication implementation with database sessions and server-side authorization. Passwords, password recovery and invitation acceptance precede optional passkeys/SSO. Choose and verify the auth package during Phase 1. User preferences and secret connector settings are separate resources.

### Data model

| Entity | Purpose |
| --- | --- |
| User, Session, Invitation | Identity, membership, expiry and revocation |
| Workspace, Membership | Ownership and administrator/member permissions |
| Application, StageEvent, Note, FollowUp | Application facts, user corrections and timeline |
| Job, SourceRecord, SearchPreferences | Canonical openings, source evidence and filters |
| Document, DocumentVersion, ParsedCV | Private upload metadata, immutable versions and extracted text |
| CoverLetter, LetterVersion | Editable per-job letters and evidence references |
| MailboxConnection, MessageEvidence, ReviewDecision | Encrypted connection secrets, deduplicated evidence and review history |
| SearchRun, Task, Watchlist, WatchlistItem | Background work, cancellation, board baselines and openings |
| Assessment, StudyPlan, StudyProgress | Explainable matching, learning recommendations and progress |
| AuditEvent | Administrative and security-relevant actions with redacted details |

Every private record carries workspace ownership. Enforce ownership in API queries and test it with two separate users. Consider PostgreSQL row security as defense in depth; do not run the application as a superuser or rely on table-owner policy behavior. [PostgreSQL row security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Delivery phases

| Phase | Deliverables | Acceptance gate |
| --- | --- | --- |
| 1 — Foundation | Production project, Docker development setup, migrations, sessions, invitation flow and private workspaces | Two invited users sign in; expired/reused invitations fail; neither can access the other's API records or documents; non-admins cannot manage members |
| 2 — Persistent core | Applications, stage events, notes, follow-ups, role preferences and sample-data onboarding | Edits survive restart; empty workspaces contain no fictional personal data; manual corrections retain history; filtering works on saved records |
| 3 — Documents and writing | Safe uploads, asynchronous PDF/DOCX parsing, reviewed CV text, versions, custom letters and export | Private files cannot be fetched by another user; oversized/invalid files fail clearly; parse failure preserves the original; user can edit/download a saved letter |
| 4 — Email evidence | Gmail and Microsoft personal/work account OAuth, initial import, incremental sync, review queue and disconnect | One Gmail and one Outlook/Live account sync without duplicates; ambiguous messages require review; manual stage corrections remain intact; revoked tokens stop sync |
| 5 — Discovery | SEEK/LinkedIn adapters where supported, manual capture, preferences, deduplication, run progress and watchlists | Real supported-source run records provenance; cancellation and transient failures recover; unavailable sources show a reason; captured duplicates do not create duplicate applications |
| 6 — Assistance | Explainable CV relevance, provider settings, contextual letter drafting and role-based interview plans | AI output links to supplied evidence, invents no qualifications, respects budgets, can be edited, and does not claim a screening probability |
| 7 — Release and mobile | Backup/restore, monitoring, dependency review, browser QA, HTTPS deployment and installable PWA | Restore succeeds on a clean instance; mobile flows work; failed jobs can be retried; deployment persists records across upgrades |
| 8 — Broader parity | Additional extractors, renderers, sponsor registers, optional tracer, OJCP, advanced analytics, passkeys/SSO | Each feature meets the coverage checklist and has its own integration/security checks |

Phases are dependency ordered, not calendar promises. Complete a small usable release after Phase 3; add mailbox history next. Production deployment to the user's server needs its hosting details and a reviewed configuration at release time.

## First implementation slice — implemented, deployment QA pending

1. Scaffold the production app alongside the preserved prototype; retain `index.html` as a design reference.
2. Add a runtime/package manifest, repeatable scripts, an environment example with placeholders and development Compose configuration.
3. Implement migrations for identities, workspaces, invitations, applications and stage events.
4. Add secure session handling and an explicit first-admin bootstrap command. Do not expose public registration.
5. Implement one vertical flow: invite a member → accept → sign in → create an application → reload and see the saved record.
6. Add database-backed tests for tenant isolation, admin permissions, invitation expiry/reuse and stage updates; run browser tests for the vertical flow.
7. Document exact startup, migration, backup and test commands once they exist.

The delivered slice also persists CV files/text, preferences and cover letters. The runtime uses SQLite instead of PostgreSQL for now. Bootstrap, backups and tests run inside Docker; secure accounts are enforced by the server. Container/browser QA remains the next acceptance gate.

## Integration rules and constraints

Gmail read-only access is a restricted scope; plan OAuth configuration and any applicable verification requirements before wider rollout. [Gmail scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes). Microsoft Graph supports personal and organizational Outlook mail; test delegated access with the user's Live account rather than assuming an O365-only adapter is sufficient. [Microsoft mail overview](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview?view=graph-rest-1.0).

Connector readiness must be visible. Never treat a saved search plan as a completed search. Search/source access, provider credentials, terms and rate limits need validation per adapter. Human verification pauses the affected source and preserves completed results. Manual capture stays usable when automated sources are unavailable.

AI providers are optional. Keep manual CV editing, letters and tracking usable without a model. Send only selected job/CV evidence; exclude unnecessary mailbox contents. Apply bounded retries, request timeouts, cost limits and redacted logs.

## Testing and release checks

Retain prototype regression checks during migration. Add meaningful API/database tests for ownership and workflow correctness; use browser tests for invitations, upload/review, letters, filtering and email association review. Use provider fixtures for deterministic tests plus explicitly configured smoke tests against real services.

Validate light/dark layouts at mobile and desktop sizes, keyboard focus, form labels, contrast, error states and long content. Document parsing needs malformed, scanned and password-protected-file cases. Test worker crashes/retries, duplicate mailbox deliveries, search cancellation, disconnected accounts and backup restoration.

## Decisions to confirm during implementation

The first slice can proceed without server credentials. Before deployment, record the server OS/architecture, available memory, domain/HTTPS arrangement and backup destination. Before live connectors, configure provider OAuth applications and source credentials. Before AI assistance, choose the model provider and spending limit. Native mobile packaging is deferred until the responsive web/PWA flow is stable.
