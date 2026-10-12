# Milo

Milo is an invite-only, self-hosted career workspace. It keeps application records, private CVs, role preferences and custom cover letters together, with a responsive light/dark interface.

## Run the live app

Requires Docker and Docker Compose. The container includes Node.js 24 and Python; no host Python or TLS certificates are required to start the app.

```sh
docker compose up --build -d
```

Open http://localhost:8080/#Signup to create your first administrator in the browser; signup signs you in automatically. `docker compose exec milo node scripts/setup-admin.cjs` is the interactive alternative. Signup closes as soon as any account exists. There are no default credentials. Administrators create member invitation links through **Invitations**; links expire after 72 hours and can be accepted only once.

Records survive container restarts in the `milo-data` named volume. See [Container setup](docs/containers.md) for server origins, ports, backups and the optional preview.

## HTTPS through your reverse proxy

Milo listens on **HTTP port 8080** by default. Your reverse proxy terminates HTTPS and forwards requests to `http://127.0.0.1:8080` (host proxy), or `http://milo:8080` on a shared Docker network (container proxy).

Copy `.env.example` to `.env` and set the exact public browser origin:

```dotenv
MILO_PUBLIC_URL=https://milo.example.com
```

Run `docker compose up -d` after changing configuration. `MILO_PUBLIC_URL` controls origin validation, Secure session cookies, invitations and OAuth callback URLs; it does not change the HTTP listener. Preserve the browser's `Origin` header through the proxy. Milo uses the configured URL and does not infer trusted origins from forwarded headers. Keep the backend on loopback or a private Docker network.

Register Gmail/Outlook redirect URLs using your external HTTPS origin, for example `https://milo.example.com/api/email/callback/gmail`. For direct Node execution only, optional TLS is available by explicitly setting both `MILO_TLS_KEY` and `MILO_TLS_CERT`; default startup never reads certificate files.

## Implemented live features

- Real invite-only accounts, password hashing, database-backed sessions and logout.
- Administrator-only member listing and invitation creation/revocation.
- Private application records: role, company, location, work arrangement, employment type, annual salary in the currency of the selected country, source URL, description, notes, dates and stage history.
- Application search/stage filters and a dashboard with pipeline/offer/follow-up counts.
- Worldwide preferences with 250 countries/territories, default currencies, city/state suggestions and visa sponsorship filters. Live jobs sort by highest CV keyword match and can be saved in one click.
- Live job search with keyword, location and remote filters, pagination and original listing links. Indeed, LinkedIn and Glassdoor use Python JobSpy; Working Nomads and Arbeitnow work without credentials. Adzuna NZ and SEEK/Apify require credentials. Coverage and sponsorship evidence vary by source. See [job discovery](docs/job-discovery.md).
- Private PDF/DOCX/TXT uploads for CVs and cover letters, with immediate local scores, authorized downloads/removal and editable extracted text. Scanned documents require OCR or pasted text.
- Local CV completeness checks and per-job keyword match scores, with matched skills, missing topics and CV evidence. Optional AI assessment, JD-specific CV tailoring and custom cover letters use a selected OpenAI, personal API key, local server or ChatGPT/Codex account. See [AI and ATS setup](docs/ai-and-ats.md). Scores do not predict hiring outcomes.
- Job-specific custom cover-letter template builder, editing, persistent saving and TXT download.
- Template-aware DOCX/PDF draft exports and animated loading/generation states. See [export styling and limits](docs/document-exports.md).
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
- [Production status](docs/deployment-status.md): why historical GitHub deployments can remain red after manual server installation.

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

Tests check accounts, ownership isolation, persistent storage, document scores, recommendations, interview evidence, email connections, origin validation, cookies and HTTP responses. Optional browser checks use a disposable database and verify uploads/scoring, role suggestions, job saving, email configuration and mobile layouts:

```sh
python scripts/check-live-ui.py
```

This optional command requires host Python 3.10+ and a running Compose network. It builds its own Chromium test image and never mounts live data. Preserve `AGENTS.md`. Backup utilities use Python's standard library; see [Container setup](docs/containers.md). Never commit credentials, local environment files, databases or TLS private keys.

See [the interface review](docs/ui-review.md) for worldwide location/currency suggestions, sponsorship filtering, CV recommendations, job saving, interview materials and browser verification. Gmail and Outlook connections require the [email OAuth setup](docs/email-sync.md).
