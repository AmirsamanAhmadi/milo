# Milo container setup

## Start the live application

The host needs Docker and Docker Compose only. Build tools, tests, the web/API server and SQLite runtime are all inside containers.

```sh
docker compose up --build -d
docker compose exec milo node scripts/setup-admin.cjs
```

The second command prompts for the first administrator's email, name and password. Password entry is hidden. Bootstrap stops working once any account exists; there is no public registration or default password.

Open http://localhost:8080 and sign in. Use **Invitations** to create a 72-hour, single-use link for a member. Copy the link when created; the secret is not stored in readable form or shown again. Deliver it yourself; invitation emails are not sent by Milo yet.

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

For your server, configure the externally reachable HTTPS origin, such as `https://milo.example.com`, and route your TLS proxy to the published container port. Forward browser Origin and Host normally; Milo does not trust forwarded headers to construct invitation URLs or identify clients. HTTPS ingress automation remains a later deployment task. Remote plain HTTP is refused unless `MILO_ALLOW_INSECURE_HTTP=true` is explicitly set for trusted development use.

Keep the default `MILO_BIND_ADDRESS=127.0.0.1` for a host-based proxy. If another machine/container must access the published port, configure the bind address and network intentionally. The built-in login limiter uses socket addresses; behind a proxy, users may share a limit. A trusted-proxy-aware limiter is a later deployment improvement.

## Design preview

The original fictional screen draft is preserved and separated from private live data:

```sh
docker compose --profile preview up --build -d
```

Open http://localhost:8081 for the design preview, or http://localhost:8080 for the live app. The preview has no authentication and no connection to the live database. Prototype-only email, learning and discovery screens are still available there.

## Storage and backups

The initial release uses SQLite in `/data/milo.sqlite`. Documents are stored as private database BLOBs, with a 10 MB upload limit and 100 MB limit per user. Their downloads require a valid owning session. SQL statements bind all user values. Session and invitation tokens are stored as hashes; passwords use salted scrypt hashes.

Create a consistent database backup, including uploaded files:

```sh
docker compose exec milo node scripts/backup.cjs /data/milo-backup.sqlite
docker compose cp milo:/data/milo-backup.sqlite ./milo-backup.sqlite
```

Keep that copy outside the server and protect it as private data. Scheduled backup storage, operator restoration tooling and a tested disaster-recovery drill are not yet implemented. Do not copy a running SQLite database directly: its WAL can contain newer records. The supplied backup command uses SQLite's backup API.

## Production direction

This is a single-server foundation. Web/API and persistence are usable; there are no dummy worker/database containers. Add a real worker when background mail/search workloads exist. Reconsider PostgreSQL and private object/file storage when concurrency, task processing or document volume requires them. All new services, HTTPS ingress and backup jobs will remain containerized.

Node 24 provides the built-in SQLite API, which is still experimental in that release. Pin reviewed runtime image digests for a release and regression-test runtime upgrades. No third-party Node packages are required by this foundation.

## Validation

`docker compose config --quiet` and `npm test` validate configuration and application behavior. Tests use real temporary SQLite databases and exercise the HTTP handler and browser script against the service; they do not replace real-browser tests. The editing environment cannot access its Docker engine, so the image build, container health check and browser startup still need verification on the Docker host.

References: [Node 24 SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [Compose startup](https://docs.docker.com/reference/cli/docker/compose/up/).
