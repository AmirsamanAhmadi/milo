# Milo screen draft

## Visual direction

Concept 03: Milo is the working name (availability not checked). Blue action accents, teal preparation highlights, white and slate surfaces, rounded panels, horizontal navigation, and role-focused study briefs. Light/dark appearance uses shared theme tokens and persists only the theme choice locally. The mobile layout remains responsive; PWA installation is not implemented.

## Screens

1. Today: next actions, pipeline summary, recent applications.
2. Applications: searchable records, status filters, evidence links.
3. Application timeline: source emails, interview details, document versions.
4. Opportunities: explained matches and existing-application warnings.
5. CV studio: illustrative match score, parsing readiness, requirements, evidence gaps. Screening probability remains unavailable until calibrated against suitable outcome data.
6. Documents: version history and application associations.
7. Connections: Gmail and Microsoft connection concepts, import period.
8. Members: administrator view, pending invitations, private member workspaces.
9. Invitation acceptance: account creation concept with browser form validation.

## Production requirements

Implement server-enforced ownership checks, expiring single-use invitations, secure sessions and password handling, encrypted OAuth credential storage, and isolated private document access. Mailbox sync must preserve manual corrections and show evidence for inferred events. Scores should explain their basis; missing evidence is not proof of missing experience.

Docker Compose will eventually run the web/backend, worker, and PostgreSQL with persistent document storage and backups. This draft has no backend and deliberately uses fictional information.

## Tooling status

Existing skill-installer and plugin-management instructions were reviewed. The skill listing helper failed because GitHub DNS/network access was unavailable. No new skills were installed. Plugin discovery returned no necessary local design/testing plugin; none were connected. This draft needs no external plugin.


## Interview preparation

Recommendations link applied roles to job requirements and confirmed CV evidence. Distinguish a topic to learn from experience to demonstrate and evidence still unknown. Rank by interview timing and relevance; show short practice tasks before longer courses when an interview is imminent. A studied checkbox records activity, not proven competence.

This prototype uses fictional role requirements. Resource links were checked on 8 October 2026: PMI KICKOFF (https://www.pmi.org/kickoff/), official Scrum Guide (https://scrumguides.org/download.html), and OpenLearn project foundations (https://www.open.edu/openlearn/money-business/leadership-management/project-management-the-start-the-project-journey/content-section-0). Course recommendations are introductory refreshers, not guarantees of readiness for senior roles. Production plans require real application descriptions, CVs, user-confirmed skills, course availability, and persistent per-user progress.


## Accounts and login

Separate screens cover login (`#Login`), personal account (`#My%20account`), and administrator member management (`#User%20management`). Profile edits stay in memory and are HTML-escaped when displayed. Login validation and password visibility are interactive, but submitting the form never authenticates or stores credentials. The prototype does not enforce access controls. Theme preference is the only locally persisted setting.


## Standalone preview reliability

`index.html` embeds the current source CSS and JavaScript. Regenerate it with `node scripts/build-preview.cjs` after source edits. Malformed hashes fall back to Today; unknown routes cannot resolve inherited object methods. Startup copy remains visible if a file viewer disables JavaScript. Open the preview in a web browser.


## Theme rendering regression

The root owns `data-theme` to select CSS colours; buttons use a distinct `data-theme-toggle` attribute. Never use the root theme attribute to find toggle controls: assigning `textContent` to the root destroys the document. Regression checks model the root selector match and verify content survives initial rendering and theme toggles.


## Administrator permissions

Members, Invitations, and User management are administrator-only routes in the interactive preview. Member navigation omits them and route/action guards reject member access. My account remains available to each user. Invitation creation and acceptance are separate screens: only administrators manage invitations, while recipients accept using a private, expiring, single-use token. Login persona buttons are design-review controls only and must not exist in production. The backend must authorize every member/invitation read and mutation using the authenticated session. Static files are fictional screen artifacts, not secured application routes.


## Richer application records

Applications supports eight sample records, salary/workplace/location, stages, source and application dates, sample CV match, document references, email summaries, and follow-up actions. Records open individually and provide editable notes/stages/date controls. Email inbox supports explicit association review and manual email-text entry; edits stay in memory. See `docs/jobops-review.md` for the reviewed workflows and production requirements.

## Workspace refinement

The dashboard adds overview cards for applications, pending email review, current CV and cover-letter drafts, with shortcuts for role preferences and job capture. Toolkit cards use clearer hierarchy, consistent spacing and rounded surfaces. Shared light/dark tokens cover the new UI; focus-visible outlines and responsive grids support keyboard and small-screen use. Product scope and implementation sequencing are now maintained in `product.md` and `build-plan.md`.
