# Planning

## Project

**Saarthi — early student support**  
**Goal:** Help faculty mentors notice early academic warning signs and offer timely, respectful support before final examinations.

## Problem and intended users

Attendance gaps, lower internal assessment results, late assignments, and lab viva performance can make it harder for a student to keep up. Mentors, department leads, and counselors need a clear way to review these signals early and follow up constructively. Academic indicators alone cannot explain a student's circumstances; the system should encourage listening, not label a person.

## Scope for the 32-hour prototype

1. Build a responsive mentor dashboard with a synthetic example cohort.
2. Import a CSV, validate academic fields, display an optional student name with a session-only generated roll number, and export the cohort.
3. Train an in-browser Random Forest classifier and report macro F1 on a deterministic, synthetic holdout set.
4. Show cohort-level feature importance and weekly attendance and assessment trends.
5. Provide student drill-downs, editable-before-sending email drafts, and a four-tutorial scenario.
6. Provide current-snapshot monthly attendance/performance summaries and student/mentor email previews for the calendar month-end.
7. Demonstrate faculty login, faculty-controlled student portal access, demo roster upload, and student roll-number/DOB progress view in browser-only mode. Backend integration is deferred.
8. Document limitations, deployment, and a presentation defense.

**Out of scope:** production-grade authentication/session revocation, multi-instance rate limiting, historical monthly snapshots, automatic monthly email delivery, institutional system integration, and production validation of any risk model.

## Users and user stories

- **Faculty mentor:** As a mentor, I want a prioritized view of early signals so I can offer a timely conversation.
- **Department lead:** As a lead, I want cohort trends and contributing factors so I can plan supportive academic resources.
- **Student counselor:** As a counselor, I want a student's week-by-week pattern and a respectful outreach starting point.
- **Student:** As a student, I want to see my latest academic snapshot after faculty opens the portal.
- **Faculty mentor:** As a mentor, I want to decide when student self-service access opens and closes.

## Requirements and acceptance checks

| Requirement | Acceptance check |
|---|---|
| CSV ingestion | Valid CSV records render; malformed headers, values, and quoted fields produce a visible actionable error. |
| Risk classification | Every record receives Safe, Moderate, or High output from the browser-run Random Forest; report the actual synthetic test macro F1 and do not imply real-world validation. |
| Feature importance | Five model inputs are ranked and displayed with normalized visual bars. |
| Student drill-down | A student row opens a dossier with scores, weekly trends, and a potential change point. |
| Faculty alert | A reviewed, constructive message can be copied or opened in the user's email client; no message is sent automatically. |
| Intervention simulation | Show the model estimate before and after a four-tutorial scenario, with assumptions and non-causal caveat. |
| Monthly report preview | Calculate cohort averages and student-level percentages from the current snapshot; show calendar month-end and draft both recipient messages without sending email. |
| Student portal demo | A sample student can sign in with roll number and DOB only while the faculty demo switch is on; display sample academic values. |
| Faculty demo | Show simulated faculty code verification and allow the faculty demo user to toggle student access and upload fictional sample rows. |
| Demo roster | Validate sample roll numbers, DOB and academic fields; clearly indicate that browser storage is not secure and cannot hold real data. |
| Privacy | Keep the ordinary demo CSV in browser memory; transmit secure roster data only through faculty-authenticated API and never store plaintext DOB. |
| Responsiveness | Dashboard remains navigable on desktop and narrow mobile viewports. |

## Risks and safeguards

- Synthetic labels and scores are not evidence of performance on real student outcomes.
- Model scores can be wrong, biased, or incomplete; staff judgement and student context come first.
- The tutorial scenario assumes illustrative feature changes and cannot establish intervention impact.
- Display-ID replacement is pseudonymization only. Data approval, access controls, consent/legal basis, retention limits, and secure infrastructure are prerequisites to any real-data deployment.
- Roll number plus DOB is weak authentication. Current demo sign-in is simulated and provides no security; do not enter real data.
- The student portal reads the latest uploaded roster values only. The model dashboard uses a separate synthetic/browser cohort; secure roster data is not used for risk predictions.
- Monthly report views remain previews; they do not store month-by-month history or send automatic email.
- The prototype must never automate academic sanctions, admissions, or dropout decisions.

## Suggested 32-hour schedule

| Elapsed time | Work |
|---|---|
| 0–3 h | Agree on personas, data schema, safeguards, and a success demo. |
| 3–13 h | Dashboard layout, cohort views, responsive styling, and accessible interactions. |
| 13–21 h | CSV parsing and validation, synthetic data, classifier, evaluation, and feature importance. |
| 21–27 h | Student dossier, outreach draft, and tutorial scenario. |
| 27–30 h | Browser-based smoke testing, error states, and privacy review. |
| 30–32 h | Documentation, presentation, and defense rehearsal. |

## Success measures

Demonstrate all six functional requirements with synthetic data; report the observed held-out synthetic macro F1; verify representative valid and invalid CSV files; and ensure each risk result is framed as a prompt for human review. The requested F1 threshold (>0.82) is a target to measure, not a result to assume or claim without the displayed evaluation.
