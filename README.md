# Milo

Milo is an invite-only, self-hosted career workspace. It keeps application records, private CVs, role preferences and custom cover letters together, with a responsive light/dark interface.

## Run the live app

Requires Docker, Docker Compose, Python 3.10 or newer and OpenSSL for local TLS setup:

```sh
python scripts/create-local-tls.py
docker compose up --build -d
docker compose exec milo node scripts/setup-admin.cjs
```

Open https://localhost:8080/#Signup to create your first administrator in the browser; signup signs you in automatically. The interactive setup command is an alternative. Signup closes as soon as any account exists. There are no default credentials. Administrators create member invitation links through **Invitations**; links expire after 72 hours and can be accepted only once.

Records survive container restarts in the `milo-data` named volume. See [Container setup](docs/containers.md) for server origins, ports, backups and the optional preview.

## Implemented live features

- Real invite-only accounts, password hashing, database-backed sessions and logout.
- Administrator-only member listing and invitation creation/revocation.
- Private application records: role, company, location, work arrangement, employment type, annual salary in the currency of the selected country, source URL, description, notes, dates and stage history.
- Application search/stage filters and a dashboard with pipeline/offer/follow-up counts.
- Live job search with keyword, location and remote filters, pagination, original listing links and reviewed import into applications. Indeed, LinkedIn and Glassdoor use Python JobSpy; Working Nomads and Arbeitnow work without credentials. Adzuna NZ and SEEK/Apify require credentials. See [job discovery](docs/job-discovery.md).
- Private PDF/DOCX/TXT uploads for CVs and cover letters, with immediate local scores, authorized downloads/removal and editable extracted text. Scanned documents require OCR or pasted text.
- Local CV completeness checks and per-job keyword match scores, with matched skills, missing topics and CV evidence. Optional AI assessment, JD-specific CV tailoring and custom cover letters use a selected OpenAI, personal API key, local server or ChatGPT/Codex account. See [AI and ATS setup](docs/ai-and-ats.md). Scores do not predict hiring outcomes.
- Job-specific custom cover-letter template builder, editing, persistent saving and TXT download.
- Optional roles suggested from the active CV and cover letter, with document evidence and one-click searches. Interview preparation pairs actual job requirements with CV examples, gaps, practice questions and study exercises.
- Gmail and Outlook connections can be configured through the portal and synced manually. See [email setup](docs/email-sync.md).
- Personal name editing, responsive layouts and light/dark mode.
- Password changing with current-password verification and revocation of other sessions, available in **My account**.

Each user's records and documents are protected by server-side ownership checks, including from administrators. The live app starts empty; it does not load fictional prototype records.

## Still being built

Background mailbox sync, additional job-board integrations, advanced AI workflows, resume rendering, watchlist refresh and advanced analytics remain planned. The design preview demonstrates those workflows with fictional data. Password recovery, member suspension, scheduled backups, restore tooling, passkeys and SSO are not implemented yet.

## Design preview

```sh
docker compose --profile preview up --build -d
```

Open http://localhost:8081. You can also open `index.html` directly. Preview edits are session-only and do not affect live data. Preview persona controls are design-review controls; the live app uses actual sessions and server permissions.

## Documentation

- [Product overview](docs/product.md): purpose, features and current scope.
- [Build plan](docs/build-plan.md): architecture, phases and delivery status.
- [Container setup](docs/containers.md): startup, administration and storage.
- [JobOps feature coverage](docs/feature-parity.md): broader parity backlog.
- [Reviewed pull requests](docs/upstream-pull-requests.json): upstream PR snapshot.

## Development and tests

All checks run in the Docker build:

```sh
docker build --target build -t milo-checks .
```

For local checks, Node.js 24 or newer is required; there are no Node package dependencies to install. Live JobSpy searches require the Python dependencies in `requirements.txt`:

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py'
```

`src/server/` contains persistence, account/workspace services and HTTP endpoints. `src/live/` contains the live interface. The original prototype stays in `src/app.js`, `src/features.js`, `src/career.js` and `src/styles.css`; its generator is `scripts/build-preview.cjs`.

Tests check invitations, authentication, ownership isolation, persistent storage, uploads, letters, origin checks, throttling, HTTP responses and the interface's application-save flow. Docker build, container health and HTTPS startup were verified on 12 October 2026. Full browser QA remains outstanding. Preserve `AGENTS.md`.

Local TLS uses a disposable self-signed certificate valid for 30 days. Trust `certs/cert.pem` in your local browser before signing in. The generator preserves existing certificates. For production, use a trusted certificate and protect its private key with file permissions that allow only the operator and container user (UID 1000) to read it. Never commit TLS keys. Set `MILO_TLS_KEY` and `MILO_TLS_CERT` for direct Node execution.


Backup and local TLS setup now use Python's standard library (Python 3.10+), with no additional pip dependencies; live JobSpy search uses the pinned package in requirements.txt. The container includes Python. The live service, administrator setup, browser interface and preview generator retain JavaScript. Legacy backup and shell TLS commands remain available for compatibility. Python backups refuse to overwrite existing files; choose a fresh destination each time.

See [the interface review](docs/ui-review.md) for worldwide location/currency suggestions, sponsorship filtering, CV recommendations, job saving, interview materials and browser verification. Gmail and Outlook connections require the [email OAuth setup](docs/email-sync.md).
