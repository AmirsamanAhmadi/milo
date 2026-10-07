# Milo CI/CD

## Fixes based on remote workflow review

Remote main at `480d77ae6bd2557d45cbc82543a269d378adaffd` contains the browser prototype and three workflow templates, but no Dockerfile, Terraform configuration or dependency lockfile. The GitHub Actions log connector repeatedly requested authentication without returning runs, so exact run failure messages could not be verified. A subsequent PR check-run read confirmed failing Snyk and Terraform jobs: [Snyk](https://github.com/AmirsamanAhmadi/milo/actions/runs/37624849459/job/113053144029), [Terraform](https://github.com/AmirsamanAhmadi/milo/actions/runs/37624849414/job/112803894991).

- **Milo CI:** run Node 24 preview generation and regression checks for pushes/PRs. Run backend tests and Docker validation/health smoke tests when their files exist. Stop test containers even after failure. No deployment is performed.
- **Snyk:** make the token available to scan steps, not only setup. If the token is absent, explicitly report that the scan was not run. Run dependency, infrastructure and container scans only for present inputs. Configured scan failures still fail the job; no `continue-on-error` hides results. SARIF upload was removed to avoid imposing code-scanning availability on this optional integration.
- **Terraform:** validate applicable configuration only, using initialization without a remote backend. Remove the template's cloud-token dependency and automatic apply. Infrastructure deployment requires a separate reviewed workflow when infrastructure actually exists.
- **AI summaries:** optional through the `MILO_AI_ISSUE_SUMMARY=true` repository variable. This requires GitHub Models access. Keep issue content out of shell source, use a body file for the comment, and constrain summaries to reported symptoms. Prompt instructions cannot guarantee that sensitive source text never appears in a model output.

## Verification

Local `npm test` passes and Ruby YAML parsing accepts all four workflows. `docker compose config --quiet` passes. Docker image/startup checks and green hosted Actions status cannot be verified from this environment; the current PR checks remain failed. The remote branch must run the new CI before merging; this does not certify the optional Snyk or Models accounts are configured.

## Requested skill

`npx --yes skillfish add karanmrn/karanagentskills ai-prompt-engineering-safety-review` failed with npm registry DNS `ENOTFOUND`. The exact upstream `SKILL.md` was retrieved via GitHub and installed under `skills/ai-prompt-engineering-safety-review/` as a repository-local copy; no global install is claimed. Upstream source commit: `f7ec41e8631911c5bcaec99ba026487beb2a53f3`.

Its prompt-review guidance was applied to the issue-summary prompt: task clarity, untrusted input, no invented root cause, minimized personal information and no command execution. This skill reviews prompts; it is not a substitute for Actions log inspection or workflow validation. Global skillfish/Codex discovery still needs installation in an environment with npm and the intended agent skill-directory access.

## Finish publishing with a working GitHub connection

The existing remote PR contains the application changes and patch, but the corrected `.github/workflows` files have not been activated. Repository contents can be written through the current PAT connector, while workflow writes return HTTP 404. The alternate connector repeatedly requests authentication without returning a completed request. These are access blockers, not failed application tests.

For a fine-grained PAT, configure this repository with Contents and Workflows read/write, and Actions read for logs. For a classic PAT, modifying workflow files requires the `workflow` scope in addition to repository access. Never paste a token into an issue, chat or committed file. [GitHub contents API permissions](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).

Alternatively, in a normal terminal from the existing workspace, run:

```sh
bash scripts/publish-ci.sh
```

It clones the existing review branch into a temporary directory, checks and applies the prepared patch, commits only the workflow files, and pushes to PR #1 without force. It does not alter this workspace's Git index or working files. The temporary checkout is retained and its path printed, including on failure. If Git author identity is not configured, configure it and rerun the commit in that checkout. If the patch no longer applies because someone has updated the branch, inspect those changes rather than forcing an overwrite.

To install the requested skill through skillfish after restoring npm access, run the original command in your normal terminal:

```sh
npx --yes skillfish add karanmrn/karanagentskills ai-prompt-engineering-safety-review
```

Local `.git` metadata remains read-only in the editing environment. The application changes are committed remotely on the PR branch, but this workspace's index has not been reconciled. Reconcile it in a normal terminal after reviewing the remote branch; preserve `.DS_Store` and any independent local changes rather than resetting them.
