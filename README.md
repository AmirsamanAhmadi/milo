# Milo

Milo is an invite-only, self-hosted career workspace. It keeps application records, private CVs, role preferences and custom cover letters together, with a responsive light/dark interface.

## Run the live app

Requires Docker, Docker Compose and OpenSSL for local TLS setup:

```sh
bash scripts/create-local-tls.sh
docker compose up --build -d
docker compose exec milo node scripts/setup-admin.cjs
```

Create your first administrator interactively, then open https://localhost:8080 and sign in. There are no default credentials or public registration. Administrators create member invitation links through **Invitations**; links expire after 72 hours and can be accepted only once.

Records survive container restarts in the `milo-data` named volume. See [Container setup](docs/containers.md) for server origins, ports, backups and the optional preview.

## Implemented live features

- Real invite-only accounts, password hashing, database-backed sessions and logout.
- Administrator-only member listing and invitation creation/revocation.
- Private application records: role, company, location, work arrangement, employment type, annual NZD salary, source URL, description, notes, dates and stage history.
- Application search/stage filters and a dashboard with pipeline/offer/follow-up counts.
- Saved role preferences, applied to saved openings; no live job discovery yet.
- Private PDF/DOCX/TXT uploads, authorized downloads/removal and reviewed CV text. TXT can fill the editor; PDF/Word extraction remains pending.
- Job-specific custom cover-letter template builder, editing, persistent saving and TXT download.
- Personal name editing, responsive layouts and light/dark mode.

Each user's records and documents are protected by server-side ownership checks, including from administrators. The live app starts empty; it does not load fictional prototype records.

## Still being built

Gmail/Outlook/Live sync, job-board extraction, AI assessments/writing, resume rendering, interview study recommendations, watchlist refresh and advanced analytics remain planned. The design preview demonstrates those workflows with fictional data. Password recovery, changing passwords, member suspension, scheduled backups, restore tooling, passkeys and SSO are not implemented yet.

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

For local checks, Node.js 24 or newer is required; there are no package dependencies to install:

```sh
npm test
```

`src/server/` contains persistence, account/workspace services and HTTP endpoints. `src/live/` contains the live interface. The original prototype stays in `src/app.js`, `src/features.js`, `src/career.js` and `src/styles.css`; its generator is `scripts/build-preview.cjs`.

Tests check invitations, authentication, ownership isolation, persistent storage, uploads, letters, origin checks, throttling, HTTP responses and the interface's application-save flow. Full browser QA and actual Docker startup verification remain outstanding. Preserve `AGENTS.md`.

Local TLS uses a disposable self-signed certificate valid for 30 days. Trust `certs/cert.pem` in your local browser before signing in. The generator preserves existing certificates. For production, use a trusted certificate and protect its private key with file permissions that allow only the operator and container user (UID 1000) to read it. Never commit TLS keys. Set `MILO_TLS_KEY` and `MILO_TLS_CERT` for direct Node execution.
