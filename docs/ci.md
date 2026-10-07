# Milo CI/CD

## Fixes based on remote workflow review

Remote main at `480d77ae6bd2557d45cbc82543a269d378adaffd` contains the browser prototype and three workflow templates, but no Dockerfile, Terraform configuration or dependency lockfile. The GitHub Actions log connector repeatedly requested authentication without returning runs, so exact run failure messages could not be verified.

- **Milo CI:** run Node 24 preview generation and regression checks for pushes/PRs. Run backend tests and Docker validation/health smoke tests when their files exist. Stop test containers even after failure. No deployment is performed.
- **Snyk:** make the token available to scan steps, not only setup. If the token is absent, explicitly report that the scan was not run. Run dependency, infrastructure and container scans only for present inputs. Configured scan failures still fail the job; no `continue-on-error` hides results. SARIF upload was removed to avoid imposing code-scanning availability on this optional integration.
- **Terraform:** validate applicable configuration only, using initialization without a remote backend. Remove the template's cloud-token dependency and automatic apply. Infrastructure deployment requires a separate reviewed workflow when infrastructure actually exists.
- **AI summaries:** optional through the `MILO_AI_ISSUE_SUMMARY=true` repository variable. This requires GitHub Models access. Keep issue content out of shell source, use a body file for the comment, and constrain summaries to reported symptoms. Prompt instructions cannot guarantee that sensitive source text never appears in a model output.

## Verification

Local `npm test` passes and Ruby YAML parsing accepts all four workflows. `docker compose config --quiet` passes. Docker image/startup checks and hosted Actions status cannot be verified from this environment. The remote branch must run the new CI before merging; this does not certify the optional Snyk or Models accounts are configured.

## Requested skill

`npx --yes skillfish add karanmrn/karanagentskills ai-prompt-engineering-safety-review` failed with npm registry DNS `ENOTFOUND`. The exact upstream `SKILL.md` was retrieved via GitHub and installed under `skills/ai-prompt-engineering-safety-review/` as a repository-local copy; no global install is claimed. Upstream source commit: `f7ec41e8631911c5bcaec99ba026487beb2a53f3`.

Its prompt-review guidance was applied to the issue-summary prompt: task clarity, untrusted input, no invented root cause, minimized personal information and no command execution. This skill reviews prompts; it is not a substitute for Actions log inspection or workflow validation. Global skillfish/Codex discovery still needs installation in an environment with npm and the intended agent skill-directory access.
