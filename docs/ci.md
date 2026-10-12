# Milo CI/CD

Every pushed commit and pull request runs Milo CI, Snyk Security and Terraform validation. The **CI/CD report** check appears on the commit and links to each run. Open its Details link to see the combined report in the Actions summary. The check remains pending while workflows run and fails if any required workflow fails or is cancelled/skipped. Reruns update the same check.

- Milo CI builds and tests the preview, tests the live backend, and builds and smoke-tests the Docker application over HTTP behind the intended HTTPS reverse proxy.
- Snyk scans all code and applicable dependencies, infrastructure and the runtime container. Later scans still run after an earlier failure. Every unreviewed finding fails the workflow, with no severity threshold or file exclusion. The two exact intentional HTTP findings are documented below and stay visible in artifacts and summaries. Missing SNYK_TOKEN is explicitly reported as an unavailable scan. Fork PRs cannot access that secret.
- Terraform validates each configuration directory without a remote backend. No Terraform configuration currently exists, so validation steps are not applicable.
- Issue summaries run on opened issues only, when MILO_AI_ISSUE_SUMMARY is enabled and Models access is configured.
- No deployment workflow exists; these checks validate the application rather than deploy it.

The report workflow uses GitHub Actions API metadata and writes a commit check with checks:write. It never checks out or executes triggering branch code, because workflow_run can have elevated permissions. See [GitHub workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

Local verification: `npm test` on Node 24+, `docker compose config --quiet`. Full container verification runs in hosted CI. Local TLS keys are ignored by Git.

The HTTP reverse-proxy change triggered two Snyk Code findings on 12 October 2026: the intentional application HTTP upstream and its loopback-only regression test. Tests, dependency scans and container scans passed. Snyk still scans all source files; no directories or severity levels are excluded.

`scripts/check-code-findings.py` reviews the raw SARIF report against `docs/code-scan-exceptions.json`. An exception requires the exact finding identity, rule, path and unchanged source statement at the reported location. Only the two documented HTTP findings are accepted. A changed location, new finding (including another HTTP listener), unknown rule, invalid report or operational scanner error fails CI. Raw findings and the review output remain attached to the run; accepted exceptions appear in its summary. Production still needs HTTPS at its reverse proxy, with the backend kept on loopback or a private network.

The gate has deterministic tests in `tests/test_security_gate.py`. The existing dependency, infrastructure and container gates remain unchanged. See [Snyk SARIF export and exit codes](https://docs.snyk.io/developer-tools/snyk-cli/scan-and-maintain-projects-using-the-cli/snyk-cli-for-snyk-code/view-snyk-code-cli-results).
