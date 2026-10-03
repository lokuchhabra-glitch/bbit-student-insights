# BBIT — early student support

BBIT is currently in **browser-only demo mode** so the faculty and student flows can be walked through before connecting a backend. The separate Node.js/MongoDB backend remains a later integration step and is not used by these demo pages.

## Run the demo

Open [`Fronted/faculty/index.html`](./Fronted/faculty/index.html) in a browser. Sign in using the demo credentials shown on the page:

- Faculty demo emails: `year1@bbit.edu`, `year2@bbit.edu`, `year3@bbit.edu`, and `year4@bbit.edu` (one account per academic year)
- Faculty demo code: `123456`

After entering the code, the faculty page itself becomes the **Faculty demo dashboard**. Use its **Turn student portal ON/OFF** button directly; you can also open the full analytics dashboard at [`Fronted/index.html`](./Fronted/index.html). Each faculty account is limited to its assigned year and its two semesters (Year 1: Semesters 1–2, Year 2: Semesters 3–4, Year 3: Semesters 5–6, Year 4: Semesters 7–8). Then preview [`Fronted/student/index.html`](./Fronted/student/index.html) with the sample student credentials:

- Roll number: `27600125001`
- Date of birth: `2005-01-15`

The faculty switch and demo roster are shared through this browser's local storage. You can close the portal at any time from the faculty dashboard. If browser `file://` storage is restricted, use VS Code Live Server or another local static server to serve the `Fronted` folder. No login email is sent and no API/database is contacted.

**Demo safety:** authentication is simulated, and demo names/DOBs/metrics are fictional. Do not upload or enter real student information. The demo is not an authentication or privacy boundary.

## What is included

- An overview of the cohort, weekly attendance and assessment trends, and model feature importance.
- A searchable student list and individual dossier with weekly trends.
- A Random Forest classifier trained and evaluated on a deterministic synthetic dataset in the browser. The dashboard reports macro F1 on a held-out synthetic test split; this is **not** evidence of performance on real students.
- Year-scoped CSV upload, validation, session-only pseudonymous display IDs, and cohort export.
- Simulated faculty code step and a faculty-controlled student portal switch.
- Student roll-number/DOB demo sign-in, a latest-record dashboard, sign-out, and a fictional sample account.
- Demo roster CSV upload and template download, saved only in this browser's local storage.
- Fictional sample student names and optional CSV `student_name` support for student lists, search, dossiers, and report previews.
- Six separate monthly snapshots per semester, with month-wise cohort summaries and student/faculty email previews. Uploading the same year/semester/month again replaces only that snapshot; snapshots persist in this browser's local storage.
- A constructive email draft for faculty review and a four-tutorial counterfactual simulation.
- Keyboard-accessible navigation, responsive layouts, and CSV template download.

The intervention simulation is an illustrative model scenario, not a causal estimate or promise that a student's outcome will change. Predictions are prompts for a human conversation—not diagnoses, decisions, or grounds for disciplinary action.

The faculty monthly reports page calculates attendance, midterm, and lab-viva averages for the selected semester and month. It previews student and mentor messages for that reporting period. Monthly snapshots are kept in this browser only. This remains a **preview only**: no scheduler runs and no student or mentor progress reports are sent automatically. No email service is called by the current demo. Real recurring student reports require a reviewed server-side scheduler, approved recipients, consent/privacy controls, and delivery monitoring.

## CSV format

Required headers: `attendance_pct`, `midterm_score`, `assignment_delay_days`, `lab_viva_score`.

Optional headers: `student_name`, `student_id`, `academic_year` (1–4), `semester` (1–8), `month_in_semester` (1–6), `department`, `tutorial_sessions`, `risk_status`, `attendance_week_1` through `attendance_week_8`, and `test_week_1` through `test_week_4`. Faculty can import only their assigned academic year and semesters. Choose Month 1–6 in the dashboard before uploading; omitted `month_in_semester` defaults to that selected month. `student_name` is displayed in student lists, dossiers, and the email preview; without it, the application displays `Student 0001` and similar placeholders. `risk_status` is retained as metadata and is not used to train this prototype. Scores and attendance are percentages from 0–100; assignment delay and tutorial sessions are non-negative numbers. Uploaded `student_id` values are not displayed; the application assigns session-only roll numbers such as `STU-0001`.

Use **Download CSV template** on the Import data page to get an example file.

## Model and limitations

Demo roster uploads are kept in browser local storage so sample accounts can be used across the faculty and student pages. The faculty dashboard's synthetic model cohort remains separate; uploaded roster records are not scored by that model. Demo login, portal toggling, and storage are not secure and must not be used with real student information.

The backend directory contains an unconnected future Node/Express/MongoDB implementation. It has not been installed, configured, or validated. Use it only after a separate integration and security review; do not assume the current demo UI is protected by it.

The prototype implements a small Random Forest classifier in plain JavaScript. A fixed-seed generator creates synthetic records and labels them using an illustrative risk rule. The records are split into training and test sets, and a held-out macro F1 is calculated in the browser. The current deterministic synthetic holdout reports **85% macro F1** in the tested browser; this is useful for exercising the demo, but does not establish performance or validity on real students. Imported `risk_status` values are retained only as metadata and are not used to train the model. No historical outcome data, calibration study, fairness assessment, causal evaluation, or institution-approved model is provided.

Before any real deployment, work with students and institutional stakeholders to establish a lawful data basis, informed and appropriate access, retention rules, human review, subgroup performance monitoring, model validation on representative historical cohorts, and an intervention evaluation plan. Do not use the prototype's synthetic score to make high-stakes decisions.

## Privacy

All demo data, including DOBs in a roster CSV, is processed/stored in this browser only and can be inspected by users of the browser profile. Do not upload real or identifiable student information. The backend is not currently wired to these pages. A later live version needs institutional approval, strong authentication, HTTPS, secure server-side storage, and access/retention controls.

## Project notes

- [Planning](./docs/PLANNING.md)
- [Progress](./docs/PROGRESS.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [Defense Q&A](./docs/DEFENSE_QA.md)

The supplied workspace did not include official documentation templates. These files use a straightforward, editable team-project structure and should be adapted if an organizer provides required templates.
