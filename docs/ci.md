# Milo CI/CD

Every pushed commit and pull request runs Milo CI, Snyk Security and Terraform validation. The **CI/CD report** check appears on the commit and links to each run. Open its Details link to see the combined report in the Actions summary. The check remains pending while workflows run and fails if any required workflow fails or is cancelled/skipped. Reruns update the same check.

- Milo CI builds and tests the preview, tests the live backend, and builds and smoke-tests the Docker application over HTTPS.
- Snyk scans code and applicable dependencies, infrastructure and the runtime container. Later scans still run after an earlier failure. Findings fail the workflow; no severity threshold or ignore rule hides them. Missing SNYK_TOKEN is explicitly reported as an unavailable scan. Fork PRs cannot access that secret.
- Terraform validates each configuration directory without a remote backend. No Terraform configuration currently exists, so validation steps are not applicable.
- Issue summaries run on opened issues only, when MILO_AI_ISSUE_SUMMARY is enabled and Models access is configured.
- No deployment workflow exists; these checks validate the application rather than deploy it.

The report workflow uses GitHub Actions API metadata and writes a commit check with checks:write. It never checks out or executes triggering branch code, because workflow_run can have elevated permissions. See [GitHub workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

Local verification: `npm test` on Node 24+, `bash scripts/create-local-tls.sh`, then `docker compose config --quiet`. Full container verification runs in hosted CI. Local TLS keys are ignored by Git.
