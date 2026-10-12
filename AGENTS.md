# Repository Guidelines

## Project Structure & Module Organization

Application code lives in `src/server/` (Node.js/SQLite service) and `src/live/` (live browser interface). The original design prototype lives in the top-level `src/` files, with generated pages in `preview/`. Automated tests live in `tests/`, utility scripts in `scripts/`, container configuration in `docker/`, and supporting documentation in `docs/`.

Use `src/` for application code, `tests/` for automated tests, `assets/` for static resources, and `docs/` for supporting documentation where applicable. Keep related modules together and avoid introducing directories without a concrete purpose.

## Build, Test, and Development Commands

Requires Node.js 24 or newer; no package dependencies need installation. Run `npm test` for preview generation and prototype/service tests, `npm run build:preview` to regenerate the preview, and `npm start` for the server with the documented TLS/environment settings. Run `docker build --target build -t milo-checks .` for container checks. See `README.md` for Docker Compose startup and administrator setup.

Provide repeatable commands through the chosen package manager or build tool. Do not assume commands such as `npm test` or `make build` work until their configuration exists. Document required runtime versions alongside setup instructions.

## Coding Style & Naming Conventions

Follow the selected language’s standard conventions. Configure a formatter and linter early, and commit their configuration so contributors use consistent rules.

Use descriptive names for files, modules, and functions. Keep indentation consistent within each file, avoid mixing tabs and spaces, and separate unrelated responsibilities into focused modules.

## Testing Guidelines

Service tests use Node's built-in test runner; prototype checks use Node assertions. `npm test` runs both. Python utility tests require Python 3.10 or newer and run with `python -m unittest discover -s tests -p 'test_*.py'`. Docker builds run all suites. No coverage threshold is configured.

Add meaningful tests for new behavior and regression tests for bug fixes. Name tests after the behavior they verify, and keep fixtures small and deterministic. State any required services or environment variables in the setup documentation.

## Commit & Pull Request Guidelines

There is no Git history available from which to infer commit conventions. Use concise, imperative commit subjects, such as `Add project setup documentation`, and keep each commit focused.

Pull requests should explain the change, its purpose, and validation performed. Link related issues when available; include screenshots for visible interface changes. Identify setup changes or outstanding limitations explicitly.

## Security & Configuration

Never commit secrets, credentials, or local environment files. When configuration is introduced, provide an example containing placeholder values and document required settings.
