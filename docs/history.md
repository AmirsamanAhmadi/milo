# Consolidated project history

The main branch was consolidated into nine milestones at the operator's request on 12 October 2026. The final application tree is preserved, including security fixes, tests, documentation and all implemented features. Intermediate fixup, WIP, patch-preparation and merge commits are grouped into their related milestones.

| Milestone | Original snapshot |
| --- | --- |
| Project foundation and design prototype | `ceca78e` |
| Persistent private application and security CI foundation | `7eb73c8` |
| Account maintenance, safe responses and Python utilities | `f193a9d` |
| Browser signup, live job discovery and CV matching | `3a107cb` |
| Private AI providers, tailoring and draft provenance | `94b3e5b` |
| Grouped navigation and responsive career workspace | `f8c2026` |
| Worldwide preferences, saved jobs, interview plans and email connections | `0da6185` |
| Document scoring and evidence-based career guidance | `bc4866a` |
| Reverse-proxy HTTP and reviewed security checks | Final tree at consolidation |

Before rewriting main, the original history was preserved in a local `archive/pre-milestones-*` branch and `.git/history-backups/pre-milestones-*.bundle`. The bundle contains the original reachable commits and can be inspected with `git bundle list-heads <bundle-path>`. It is deliberately not published as another GitHub branch. The update uses an explicit force-with-lease against the previously observed remote SHA to reject concurrent changes.

Existing collaborators should retain their old branches, fetch the new history, and create a fresh branch from `origin/main` before transferring any unpublished changes. No application data or Docker volumes are modified by the history rewrite.
