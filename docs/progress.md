# Progress

## Current snapshot

The current workspace is in browser-only demo mode. Open `Fronted/faculty/index.html`, use `mentor@bbit.edu` / `123456`, then switch the student portal ON/OFF directly in the Faculty demo dashboard. Try `27600125001` / `2005-01-15` in `Fronted/student/index.html`. No backend is required or called by the demo.

## Implemented

- Overview dashboard with cohort counts, trend chart, feature importance, search, and risk filters.
- Student cards and detailed weekly view.
- Fictional demo student names, plus optional `student_name` CSV support in lists, search, dossiers, monthly report previews, and cohort export; records without names receive a clear placeholder.
- Browser-based CSV parser with quoted-field handling, required-field checks, numeric validation, file-size limit, session-only display IDs, and download template/export actions.
- A small in-browser Random Forest and deterministic train/test split; the tested browser reports 85% macro F1 on synthetic held-out rows. This does not satisfy real-world model validation, and imported labels are not used for training.
- Constructive faculty email suggestions with copy and mail-client actions; sending is always manual.
- Monthly cohort averages and individual student/faculty email previews, with the next calendar month-end displayed. Automatic scheduling and delivery are not implemented.
- Four-tutorial illustrative scenario with an explicit non-causal caveat.
- Responsive layout, keyboard-operable student views, and accessible status/dialog labels.
- Simulated faculty verification and a student roll-number/DOB login, with fictional sample credentials visible in the demo UI.
- Faculty ON/OFF switch, demo roster CSV import, and the student dashboard share this browser's local storage so the flow can be demonstrated across pages.
- README, planning, progress, deployment, and defense Q&A documents.

## Not implemented / not production-ready

- The backend under `backend/` is not connected to the current demo frontend and is not validated.
- Demo authentication is not security: demo roster DOBs are kept in browser local storage, which is not an appropriate location for real student information.
- Demo roster records and the faculty dashboard's browser-only model cohort are separate; roster data is not used for risk predictions.
- No historical monthly snapshots, automatic monthly-report scheduler, or automatic student/mentor progress email delivery is provided. The demo sends no email.
- The prototype does not provide session revocation, persistent/shared rate limiting, an audit trail, or an institution-managed production environment.
- CSV imports do not train or validate on historical outcome labels; predictions use the embedded synthetic-trained model.
- The displayed F1 is a synthetic holdout measurement only, not a verified result for the >0.82 real-data target.
- No real intervention effect, subgroup fairness, calibration, or deployment assessment has been established.

## Verification checklist

- [ ] Walk through demo login, faculty portal ON/OFF, sample student login and student dashboard.
- [ ] Confirm student login is disabled while portal is OFF, and accepts the shown demo credentials when ON.
- [ ] Upload the demo roster template and verify a row can sign in on the student page.
- [ ] Confirm the pages clearly label demo data, demo authentication, and local-only storage.
- [ ] Do not use actual student names, DOBs, or academic data during this demo.
- [ ] Open the page in a current desktop browser and a narrow/mobile viewport.
- [ ] Confirm a generated cohort, visible macro F1, feature importance, and all three risk categories.
- [ ] Import the downloaded template and inspect the rendered, pseudonymized students.
- [ ] Try a malformed header, invalid numeric range, broken quote, and oversized CSV; check for clear errors.
- [ ] Open a student dossier, inspect the weekly view, and verify email copy/open actions remain user initiated.
- [ ] Compare the tutorial scenario and read the limitations shown beside it.
- [ ] Check monthly report averages and student/mentor previews against the current cohort; confirm the page clearly states that no background schedule or email delivery is active.
- [ ] Confirm demo roster stays in browser local storage and is not sent to the backend.
- [ ] Confirm monthly emails are previews only and no scheduler or month-history storage is active.
- [ ] Before any real-data trial, obtain appropriate institutional review and independently validate performance and fairness.

## Team updates

| Date | Update |
|---|---|
| 2026-10-02 | Initial browser prototype and team documentation created. |
| 2026-10-03 | Switched faculty/student walkthrough to a browser-only demo flow; backend integration deferred until the demo is reviewed. |
