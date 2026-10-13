# Accounts and application analytics

Anyone can create an account at `/#Signup`. The first account is the administrator; subsequent accounts are regular members, regardless of any role supplied in a request. Registration signs the user in and does not require an invitation. Existing invitations remain optional. Email addresses are not verified by a confirmation email.

Administrators can open **Administration → Members**, search all registered users by name or email, and reset another user's password. The administrator must confirm their own password, and the new password must contain 12–128 characters. A reset signs out every session belonging to the affected user and records the actor, target and timestamp without storing the password in the audit record. Share the new password privately; Milo does not send reset emails. Users change their own passwords in **My account**. Administrators cannot view other users' CVs, applications or analytics.

Open **Find jobs → Analytics** to see application statistics and CV-based direction. All data belongs to the signed-in user. Choose all time or a 30-, 90-, 180- or 365-day application cohort. Cohorts use the entered application date, falling back to the saved date. The activity chart shows the last six calendar months for that cohort.

- Saved jobs include Discovered and Ready jobs that have not been submitted.
- Submitted jobs have an application date, an Applied/No response stage, or a recorded employer-response stage.
- A response is a recorded recruiter screen, assessment, interview, offer or rejection, including historical stages. A withdrawal alone is not a response.
- Response, interview and offer rates count each submitted application once. Without submitted applications, rates are shown as unknown, rather than zero.
- Interviews require a recorded interview stage; an offer alone does not invent an interview.
- Average response timing uses the first recorded response stage and the entered application date or first Applied event. Only nonnegative intervals are included; the sample size is shown. These are tracking dates, not verified employer response timestamps.
- The company response table shows submitted and responding application counts alongside percentages. A single response from one application does not establish a reliable company-wide response rate.

CV role suggestions use readable uploaded/reviewed CV text. The page scores up to 100 recent saved job descriptions in the selected cohort using the existing local keyword assessment. Role/company charts average the available scores and display scored-job counts. Unscored jobs are excluded. Missing CV text, short descriptions and unavailable assessment services are explained while application statistics remain available.

Company matches describe saved roles at that company, not its wider hiring activity or culture. Keyword matches do not verify seniority, sponsorship, eligibility or a universal ATS pass score. Review each job in the Job toolkit before deciding where to apply. Mailbox sync does not automatically count email snippets as employer responses; keep the application stages current.
