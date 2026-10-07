# Milo — Product Overview

## What is Milo?

Milo is a personal career workspace that helps people find suitable jobs, remember where they applied, prepare stronger application documents, and study for interviews. It brings applications, email evidence, CVs, cover letters and next actions into one place.

The intended product is invite-only and self-hosted on your server through Docker. Each user has a private workspace. Administrators manage invitations and membership; ordinary members manage their own job search. The interface supports light and dark mode and adapts to mobile screens. An installable mobile web app is planned before considering a native app.

## Live release status

The first live foundation now implements real invite-only accounts, administrator-created/revoked invitation links, secure cookie sessions, private applications and stage history, saved preferences, private CV files and reviewed text, and persistent per-job cover letters. The live service uses SQLite in a Docker volume and starts empty. It does not use the preview's persona controls or fictional records. Administrators can manage membership invitations without reading other users' private content.

Live features save to the server. Light/dark preference stays in the browser. Mailbox sync, external job search, PDF/Word parsing, AI matching/writing and personalized learning recommendations remain planned. The feature table below describes the original prototype alongside the remaining product scope; see [README](../README.md) for the current live feature list.

## The problem it solves

Applying across LinkedIn, SEEK and company sites leaves scattered records and email threads. People can forget previous applications, miss follow-ups, reuse unsuitable letters, and struggle to decide what to study before interviews. Milo connects those steps while showing the evidence behind its recommendations.

## The main user journey

1. Accept an invitation and set up your private account.
2. Upload a CV, review extracted text, and choose role preferences.
3. Connect Gmail and Microsoft Outlook/Live with read-only access.
4. Review recovered applications and confirm uncertain email associations.
5. Discover suitable roles or capture a job manually; see previous application evidence.
6. Review CV gaps, prepare a truthful cover letter, and record the application.
7. Track replies and follow-ups; prepare with role-specific topics, resources and practice questions.

Real accounts and private saved data are implemented in the live app. Synchronization and connected discovery remain planned.

## Feature inventory

| Area | Available in the browser prototype | Production scope |
| --- | --- | --- |
| Today | Pipeline counts, messages needing review, CV status, letter count and shortcuts | Personalized deadlines, reminders and synchronization status |
| Applications | Sample list/board, search, filters, notes, stages, contacts, salary and follow-ups | Persistent records, event history, ownership enforcement and document associations |
| Email inbox | Sample Gmail/Outlook messages, pasted email text, confirm/ignore associations | OAuth, incremental synchronization, confidence-based classification and reliable retries |
| CV studio | Local PDF/DOCX/TXT attachment, TXT import and editable CV text | PDF/Word extraction, structured CV versions, matching analysis and PDF output |
| Cover letters | Job selector, recipient, tone, verified evidence, motivation, template draft, editing and TXT download | AI-assisted writing with editable evidence, version history and formatted export |
| Role preferences | Titles, location, workplace, employment type, minimum annual NZD salary, unknown-salary inclusion and excluded companies | Richer geography, currencies, seniority, eligibility and connector-aware search |
| Opportunities | Sample openings filtered by preferences, application links and letter shortcuts | LinkedIn/SEEK and additional supported sources, explained relevance and duplicate warnings |
| Discovery | Validated plans, pasted job capture, duplicate prevention and bulk Ready/Skipped actions | Extractors, queues, run progress, cancellation, cost controls and recovery |
| Watchlists | Save up to 50 board URLs, duplicate prevention, ignore/restore | First-refresh baseline, new-opening detection and supported board adapters |
| Interview prep | Three sample role plans, learning links, exercises and study completion | Real CV/job gap analysis, saved progress, interview timing and personalized resources |
| Analytics | Current stage counts and source response counts; small-sample suppression | Date cohorts, conversion funnels, daily trends and outcome history |
| Accounts | Account forms, member/admin preview personas and admin route visibility | Secure sessions, invitations, tenant isolation, audited administration and recovery |
| Appearance | Responsive layout, light/dark mode and saved theme preference | Installable mobile experience and accessibility/browser validation |

The original design preview remains separate from the live app. Prototype changes stay in memory until refresh or navigation to another standalone screen. Only the theme preference persists locally. There is no real login, live mailbox connection, automatic submission, AI assessment or production backend.

## Matching and screening scores

Milo should show an explainable relevance score against a specific job: essential requirements, skill terminology, verified experience and document readability. Missing evidence must be labeled unknown rather than treated as proof the user lacks experience.

A CV relevance score is not a probability of passing automatic screening. Employer screening rules vary; Milo must not display a percentage likelihood unless a model has been validated and calibrated against suitable outcome data. Current uploads are not scored.

## Writing and learning principles

Cover letters must use user-confirmed experience and never invent achievements, qualifications or eligibility. Users review drafts before using them. Email synchronization must preserve manual corrections and expose the source message for inferred events.

Interview plans should separate topics to learn, experience to demonstrate and evidence to clarify. Prefer short, relevant practice tasks when an interview is close. Course completion indicates study activity, not verified competence.

## Privacy and administration

Production accounts, CVs, email evidence and documents are private to the owning workspace. Administrative membership access does not automatically permit reading personal documents or mail. Use expiring single-use invitations, encrypted provider credentials, protected downloads and clear disconnect/deletion controls. Sending email or submitting applications requires a separate explicit user action.

## JobOps influence and scope

Milo draws workflow ideas from [JobOps](https://github.com/DaKheera47/job-ops), while adding focused interview learning and its own interface. [Feature coverage](feature-parity.md) tracks upstream functionality and the reviewed PR proposals. Full parity is a staged backlog, not a description of the current prototype. Before reusing upstream code, review its license and attribution obligations.

## Success criteria

A production user can recover and confirm their application history, avoid duplicate applications, filter relevant openings, save a CV and letter, and prepare for an interview without losing work. Every derived recommendation has visible evidence; every private record remains isolated from other members.

See [Build plan](build-plan.md) for architecture, delivery phases and acceptance criteria.
