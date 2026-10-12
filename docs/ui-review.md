# Live interface review

Navigation groups live search, preferences and applications under **Find jobs**; CV studio, job toolkit and cover letters under **CV & writing**; account and AI connections under **Settings**. Administrators also see **Administration** for members and invitations. Native disclosure menus support keyboard navigation and Escape to close. Active pages highlight their group.

Role preferences use separate sections for roles/location, work arrangement/pay and excluded companies. The selected country persists to live search and determines the salary currency: New Zealand → NZD, Australia → AUD, United Kingdom → GBP, United States → USD. Each application saves its own country and currency. Legacy records retain NZD, matching the previously displayed currency. No exchange-rate conversion occurs. Country changes clear salary input for confirmation; preference thresholds never compare different currencies as if they were the same.

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

Backend currency validation is included in `npm test` and Docker builds. Python and service tests do not require the optional browser test image.
