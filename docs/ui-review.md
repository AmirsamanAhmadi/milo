# Live interface review

Navigation groups live search, preferences and applications under **Find jobs**; CV studio, job toolkit and cover letters under **CV & writing**; account and AI connections under **Settings**. Administrators also see **Administration** for members and invitations. Native disclosure menus support keyboard navigation and Escape to close. Active pages highlight their group.

Role preferences use separate sections for roles/location, work arrangement/pay and excluded companies. The country selector includes 250 countries and territories from the bundled geography snapshot, with automatic default currencies and over 140,000 state/city suggestions. Each application saves its own country and currency. Legacy records retain NZD, matching the previously displayed currency. No exchange-rate conversion occurs. Country changes clear salary input for confirmation; preference thresholds never compare different currencies as if they were the same. See the [data attribution and refresh command](../src/server/geography/README.md).

Visa sponsorship can be required, required with unknown listings included, or not required. Explicit negative sponsorship wording takes precedence over positive keywords; unstated information stays unknown. Live jobs sort by highest local CV keyword score, with unscored jobs last. Save job creates an application immediately, independently of preference filtering; saved jobs appear in Applications. CV recommendations derive search terms from the uploaded/reviewed CV locally, and start automatically when no target keywords are saved. The recommendation button can also replace an existing search.

Interview preparation quotes requirements from the selected job and actual CV excerpts, identifies evidence gaps and builds practice questions and answer outlines around that pair. Study exercises use the same requirements and CV examples. Inferred relevance needs review; no accomplishments are invented. It is available on live listings, saved applications and Job toolkit. Email sync supports Gmail and Outlook OAuth; see [mailbox setup](email-sync.md).

CV & cover letters accepts PDF, DOCX and TXT uploads for both document types. Text extraction and local scoring happen in the upload request, and results appear immediately. CVs use completeness checks; cover letters use writing checks, optionally against a selected saved role/company. Unreadable files retain a warning and an unavailable score. New UI uploads become the active document of their type; cover letters never replace the active CV. Reviewed text can be edited and rescored. Job search always shows optional role suggestions with their CV/cover-letter source and evidence, even when target preferences already exist. Selecting a suggestion searches that role.

Job toolkit separates the job brief, comparison/generation controls and editable drafts. AI settings presents provider cards, relevant key inputs and an account-sign-in panel. Layouts use the existing light/dark theme and collapse on smaller screens.

## Browser verification

With Milo's Compose network and TLS files present, run:

```sh
python scripts/check-live-ui.py
```

This builds a separate Chromium/Playwright test image and starts a disposable Milo instance with a temporary database. It never mounts the live data volume. Browser fixtures create an account and sample documents only in that instance. External job-search responses are mocked. The script checks currency switching/persistence, provider cards, desktop/mobile navigation, theme switching and mobile overflow, and saves screenshots. The temporary server is removed afterward.

Screenshots contain fictional review data:

- [Role preferences](screenshots/role-preferences.png)
- [Job toolkit](screenshots/job-toolkit.png)
- [AI settings](screenshots/ai-settings.png)
- [AI settings in dark mode](screenshots/ai-settings-dark.png)
- [Mobile navigation](screenshots/mobile-navigation.png)
- [Interview preparation](screenshots/interview-preparation.png)
- [Email sync](screenshots/email-sync.png)
- [Document upload scores](screenshots/document-scores.png)
- [Suggested roles](screenshots/suggested-roles.png)

Backend currency validation is included in `npm test` and Docker builds. Python and service tests do not require the optional browser test image.
