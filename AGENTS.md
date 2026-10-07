# Repository Guidelines

## Project Structure & Module Organization

This directory currently contains no source code, tests, assets, or project configuration. Establish the layout when adding the first implementation, and update this guide to match it.

Use `src/` for application code, `tests/` for automated tests, `assets/` for static resources, and `docs/` for supporting documentation where applicable. Keep related modules together and avoid introducing directories without a concrete purpose.

## Build, Test, and Development Commands

No build system, package manager, or development commands are configured yet. When selecting a stack, document the exact installation, local execution, build, and test commands in `README.md`.

Provide repeatable commands through the chosen package manager or build tool. Do not assume commands such as `npm test` or `make build` work until their configuration exists. Document required runtime versions alongside setup instructions.

## Coding Style & Naming Conventions

Follow the selected language’s standard conventions. Configure a formatter and linter early, and commit their configuration so contributors use consistent rules.

Use descriptive names for files, modules, and functions. Keep indentation consistent within each file, avoid mixing tabs and spaces, and separate unrelated responsibilities into focused modules.

## Testing Guidelines

No test framework or coverage threshold is currently defined. Select a framework appropriate to the implementation and document how to run it.

Add meaningful tests for new behavior and regression tests for bug fixes. Name tests after the behavior they verify, and keep fixtures small and deterministic. State any required services or environment variables in the setup documentation.

## Commit & Pull Request Guidelines

There is no Git history available from which to infer commit conventions. Use concise, imperative commit subjects, such as `Add project setup documentation`, and keep each commit focused.

Pull requests should explain the change, its purpose, and validation performed. Link related issues when available; include screenshots for visible interface changes. Identify setup changes or outstanding limitations explicitly.

## Security & Configuration

Never commit secrets, credentials, or local environment files. When configuration is introduced, provide an example containing placeholder values and document required settings.
