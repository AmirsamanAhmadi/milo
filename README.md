# Milo

Milo is a personal career workspace for tracking job applications, reviewing email evidence, preparing CVs and cover letters, finding relevant roles, and studying for interviews. The intended application is invite-only and Docker-hosted on your own server, with private user accounts and administrator-only membership management.

**Current state:** a working browser prototype with fictional data and session-only edits. Real authentication, persistent storage, live mailbox synchronization, job extraction and AI services are not implemented.

## Documentation

- [Product overview](docs/product.md): what Milo is, user journeys, features and current limits.
- [Build plan](docs/build-plan.md): proposed architecture, delivery phases and the first production implementation slice.
- [JobOps feature coverage](docs/feature-parity.md): upstream scope and implementation gaps.
- [Reviewed pull requests](docs/upstream-pull-requests.json): upstream PR links and status snapshot.
- [Design notes](docs/design.md): visual direction and prototype behavior.

## Open the prototype

Open `index.html` directly in a web browser. It contains the complete preview and needs no server. Alternatively, with Python 3 installed:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then visit http://localhost:8080. Standalone screen previews are in `preview/`; opening a separate file starts a fresh session.

## Try the workflows

- **Applications:** search, filter, switch list/board views and edit individual records.
- **Email inbox:** review sample Gmail/Outlook evidence or paste email text; confirm/ignore associations without overwriting a manually selected stage.
- **CV studio:** attach PDF, DOCX or TXT up to 10 MB. TXT imports directly; paste PDF/Word text for now.
- **Opportunities → Role preferences:** filter title, location, workplace, employment type, annual NZD salary and excluded companies.
- **Writing:** choose a job, add verified evidence and motivation, build/edit a custom template letter and download TXT.
- **More → Career toolkit:** plan searches, capture jobs manually, maintain watchlists and inspect analytics/feature coverage.
- **Interview prep:** explore sample role-specific topics, exercises and linked learning resources.
- **Login preview:** switch member/admin personas to review visibility; these controls do not authenticate users.

CVs, letters, preferences and manual changes reset on refresh. Only theme preference persists locally. No uploaded content is sent anywhere. Current uploads are not scored; template letters are not AI-generated. Static administrator screens are fictional design artifacts, not secured resources.

## Development

Requires Node.js for generation and regression checks; no package dependencies are installed.

```sh
node scripts/build-preview.cjs
node tests/prototype.test.cjs
```

Source is in `src/app.js`, `src/features.js`, `src/career.js` and `src/styles.css`. `scripts/load-source.cjs` assembles the scripts, and the builder generates 30 self-contained screens. Automated tests use a simulated DOM; browser/layout QA is still required. Preserve the existing `AGENTS.md`.

## Next milestone

Build the production foundation: Docker development services, database migrations, secure invite-only accounts and a saved application workflow. The acceptance gate is two users with isolated records, admin-only invitations, and data that survives restart. See the [first implementation slice](docs/build-plan.md#first-implementation-slice).
