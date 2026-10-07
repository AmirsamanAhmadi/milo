# JobOps review and Milo application workspace

Reviewed 8 October 2026. This is a documentation review, not an installation or full source audit. Milo implements its own prototype UI; no JobOps source was copied.

## Reference workflows

- [Repository](https://github.com/DaKheera47/job-ops): job suitability scoring, tailoring, discovery, and Gmail post-application tracking.
- [Orchestrator](https://github.com/DaKheera47/job-ops/tree/main/orchestrator): pending email review, approve/ignore actions, job detail updates, and Gmail OAuth workflow.
- [In Progress Board](https://jobops.dakheera47.com/docs/features/in-progress-board/): post-application stages and deliberate stage transitions.
- [Ghostwriter](https://jobops.dakheera47.com/docs/features/ghostwriter/): per-job writing and interview support using job context and selected notes.
- [Overview](https://jobops.dakheera47.com/docs/features/overview/): response analytics with sample sizes and explicit definitions.

The dedicated tracking documentation endpoint returned HTTP 502; the orchestrator README supplied the tracking workflow reference.

## Implemented in Milo

Richer application metadata, list/stage-board views, filters and sorting, individual records, recruiter contacts, submitted document references, editable status/notes/follow-up dates, and activity history. Email cards include provider, date, sender, recipient, subject, body, classification, and association state. A review queue supports confirm/ignore and manual text entry. These features work on sample records and session-only edits.

## Design decisions

Email association and application stage are separate decisions. An ambiguous message cannot silently change status, and ignoring a message is not a job rejection. Unconfirmed applications are labelled for review. The same employer may have different roles; associations use application IDs. Unknown document versions and salaries remain unknown. Course recommendations are offered only for sample roles with a matching preparation plan.

## Production follow-through

Read-only Gmail and Microsoft OAuth connectors, incremental synchronization, message deduplication, attachment/document matching, persistent event history, per-user ownership checks, and provider message links need backend implementation. Capture evidence before proposing status transitions, preserve manual corrections, and never treat absent email as proof of non-application. Store immutable application-time job/document snapshots. Add outcome analytics once real data exists, always showing counts alongside rates. Job-specific AI drafting remains a later feature; current record editing performs no AI inference.
