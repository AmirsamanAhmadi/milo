#!/usr/bin/env bash
# Run from a normal terminal with GitHub credentials allowed to write workflows.
# Work in a separate clone; never reset, stash, or overwrite the original checkout.
set -euo pipefail
milo_source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
milo_publish_dir="$(mktemp -d "${TMPDIR:-/tmp}/milo-ci-publish.XXXXXX")"
milo_review_branch='fix/ci-workflow-configuration'
trap 'printf "Publishing checkout retained at: %s\n" "$milo_publish_dir"' EXIT

git clone --single-branch --branch "$milo_review_branch" \
  https://github.com/AmirsamanAhmadi/milo.git "$milo_publish_dir/repo"
git -C "$milo_publish_dir/repo" apply --check "$milo_source_dir/docs/ci-workflows.patch"
git -C "$milo_publish_dir/repo" apply "$milo_source_dir/docs/ci-workflows.patch"
# Reuse existing checkout identity if it is repository-local rather than global.
for milo_identity_key in user.name user.email; do
  milo_identity_value="$(git -C "$milo_source_dir" config "$milo_identity_key" || true)"
  if [ -n "$milo_identity_value" ]; then
    git -C "$milo_publish_dir/repo" config "$milo_identity_key" "$milo_identity_value"
  fi
done
git -C "$milo_publish_dir/repo" add -- .github/workflows
git -C "$milo_publish_dir/repo" commit -m 'Fix Milo CI workflows and optional integrations'
git -C "$milo_publish_dir/repo" push origin "HEAD:$milo_review_branch"
printf 'CI fixes pushed to PR #1. Check the Actions runs before merging.\n'
