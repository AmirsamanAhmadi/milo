# Milo container setup

## Start the live application

The host needs Docker and Docker Compose. Default startup uses HTTP and requires no TLS files. Build tools, tests, the web/API server and SQLite runtime are all inside containers.

```sh
docker compose up --build -d
docker compose exec milo node scripts/setup-admin.cjs
```

The administrator setup command prompts for the first administrator's email, name and password. Password entry is hidden. Bootstrap stops working once any account exists; there is no public registration or default password.

Open http://localhost:8080/#Signup to create the first administrator through the browser instead of the interactive command. Signup signs you in automatically and closes once an account exists. Existing users sign in at http://localhost:8080. Use **Invitations** to create a 72-hour, single-use link for a member. Copy the link when created; the secret is not stored in readable form or shown again. Deliver it yourself; invitation emails are not sent by Milo yet.

The live app starts empty. Add your own applications, CV documents/text, preferences and cover letters. These are saved in the `milo-data` Docker volume. A normal `docker compose down` preserves the volume. Removing the volume deletes the data.

```sh
docker compose ps
docker compose logs --tail=100 milo
docker compose down
```

Rebuild after source edits using `docker compose up --build -d`. The image runs both prototype and backend tests before packaging the live runtime. The server runs as a non-root user with a read-only image filesystem; `/data` holds persistent data and `/tmp` is temporary.

## Configuration

Copy `.env.example` to `.env` to change settings. `MILO_PUBLIC_URL` must exactly match the browser origin, including port. It controls origin checks, invitation URLs and secure cookie configuration.

For another local port, set both:

```dotenv
MILO_PORT=8090
MILO_PUBLIC_URL=http://localhost:8090
```

For your server, set `MILO_PUBLIC_URL` to the external HTTPS origin, such as `https://milo.example.com`. Your reverse proxy manages TLS and forwards to the container over HTTP (`http://127.0.0.1:8080` for a host proxy, or `http://milo:8080` on a shared Docker network). Preserve browser Origin and Host headers. The configured origin controls Secure cookies, invitations and OAuth callbacks independently of the HTTP listener. Forwarded headers do not override origin validation or identify clients.

Keep the default `MILO_BIND_ADDRESS=127.0.0.1` for a host-based proxy. If another machine/container must access the published port, configure the bind address and network intentionally. The built-in login limiter uses socket addresses; behind a proxy, users may share a limit. A trusted-proxy-aware limiter is a later deployment improvement.

## Live job search

In the live portal, open **Opportunities**, choose a source and search. Arbeitnow is available without a key and covers mainly Europe; remote jobs may have country restrictions. Keyword and location filters apply to each downloaded page, so an empty page can still have more results on subsequent pages. Results are cached for 15 minutes. **Review and save** fills an application draft for review; verify the work arrangement and employment type before saving. Salary remains blank because foreign-currency and predicted figures are not imported as NZD. Existing saved URLs open their application instead of creating another draft.

For New Zealand listings, register at [Adzuna's developer portal](https://developer.adzuna.com/), set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in your ignored `.env`, and run `docker compose up -d`. Select **Adzuna NZ** in Opportunities. Credentials stay on the server. The remote-only filter is available for Arbeitnow, Working Nomads and JobSpy; Adzuna does not verify work arrangements. Live Adzuna validation requires your credentials. Local direct Node execution also requires Python 3.10+; set `MILO_PYTHON=python` if the executable is not named `python3`.

Provider requests have time and response-size limits. Searches require a signed-in account, check the request origin and throttle repeated requests. Provider outages display an error without inserting fictional results or changing saved applications. JobSpy sources use the pinned Python dependency in requirements.txt. See [job discovery](job-discovery.md) for the additional sources, country filters, combined search and optional paid SEEK/Apify setup.

Sources: [Arbeitnow API](https://www.arbeitnow.com/blog/job-board-api), [Adzuna search API](https://developer.adzuna.com/docs/search).

## Design preview

The original fictional screen draft is preserved and separated from private live data:

```sh
docker compose --profile preview up --build -d
```

Open http://localhost:8081 for the design preview, or http://localhost:8080 for the live app. The preview has no authentication and no connection to the live database. Prototype-only email, learning and discovery screens are still available there.

## Storage and backups

The `database` container owns SQLite in `/data/milo.sqlite`; the web container sends queries through a private Unix socket. There is no published database port. Transactions stay on one connection, roll back on disconnect, and have a ten-second safety lease. Documents are stored as private database BLOBs, with a 10 MB upload limit and 100 MB limit per user. Their downloads require a valid owning session. SQL statements bind all user values. Session and invitation tokens are stored as hashes; passwords use salted scrypt hashes.

Create a consistent database backup, including uploaded files:

```sh
docker compose exec database node scripts/backup.cjs /data/milo-backup.sqlite
docker compose cp database:/data/milo-backup.sqlite ./milo-backup.sqlite
```

Keep that copy outside the server and protect it as private data. Back up the `milo-private-data` volume as well: it contains the encryption key and private AI account files needed to restore connections. The database-only backup does not contain this key. Scheduled backup storage, operator restoration tooling and a tested disaster-recovery drill are not yet implemented. Do not copy a running SQLite database directly: its WAL can contain newer records. The supplied backup command uses SQLite's backup API.

## Production direction

This is a single-server foundation. Web/API and SQLite run in separate containers. The existing `milo-data` volume remains mounted only by the database service. The web container uses a new `milo-private-data` volume for provider-key material and private AI account files; the database service copies those legacy files once before becoming healthy, keeping the originals intact. The web container has no database-file mount. The socket has owner-only permissions and is mounted only into these two services. Add a real worker when background mail/search workloads exist. Reconsider PostgreSQL and private object/file storage when concurrency, task processing or document volume requires them. All new services, HTTPS ingress and backup jobs will remain containerized.

Node 24 provides the built-in SQLite API, which is still experimental in that release. Pin reviewed runtime image digests for a release and regression-test runtime upgrades. No third-party Node packages are required by this foundation.

## Validation

`docker compose config --quiet`, `npm test` and `python -m unittest discover -s tests -p 'test_*.py'` validate configuration and application behavior. Tests use real temporary SQLite databases and exercise the HTTP handler and browser script against the service; they do not replace real-browser tests. On 12 October 2026, the Docker image built successfully with all 15 service tests, prototype checks and 8 Python tests passing. The live container became healthy and its HTTPS health endpoint and login page returned HTTP 200. Full interactive browser QA remains outstanding.

References: [Node 24 SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [Compose startup](https://docs.docker.com/reference/cli/docker/compose/up/).

Optional direct TLS for Node execution requires explicit `MILO_TLS_KEY` and `MILO_TLS_CERT` paths. The legacy local certificate generators remain available, but default Docker startup does not use or mount certificates. Never commit private keys.

## Upgrade to the separate database container

Before upgrading an existing deployment, take a consistent backup using the old web container's backup command and copy it off the server. Preserve `/data/provider-key` and any private AI account files alongside the database backup: credentials need their existing encryption key. Stop the old application before starting the new database service, so two processes never own the database during migration:

```sh
docker compose stop milo
docker compose up --build -d
docker compose ps
```

Keep the same Compose project name and `milo-data` volume. No schema conversion or database export/import is needed. On first startup, credential files are copied into `milo-private-data` before the web service starts; existing private files are never overwritten. Conflicting encryption keys stop migration rather than silently making stored credentials unreadable. Never run `docker compose down -v` during an upgrade. Administrator setup commands still run in `milo` and connect to the database service automatically. Database backups now run in `database` using the command above. Run the web container with `MILO_DB_SOCKET=/run/milo-db/database.sock`; omitting it retains local SQLite for standalone development and disposable tests. The web service reconnects on the next request after a database restart. It never automatically retries an interrupted write; review the result before retrying. Its health endpoint reports database outages.
