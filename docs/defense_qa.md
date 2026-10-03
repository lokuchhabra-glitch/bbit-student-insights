# Defense Q&A

### What problem does Saarthi address?

It demonstrates how faculty mentors might notice attendance, assessment, submission-delay, and lab-viva signals early enough to offer support before final examinations.

### Who is it for?

Faculty mentors are the primary users. Department heads and student counselors may use cohort-level trends and student drill-downs to coordinate supportive follow-up.

### What does the risk classifier do?

The prototype runs a small Random Forest in the browser and maps votes to Safe, Moderate, or High. It is trained on a deterministic synthetic dataset and reports macro F1 on a separate synthetic holdout. The current tested browser reports 85%. That score is not evidence that the model predicts real dropout or passing outcomes.

### How do you meet the requested F1 target?

The application displays the measured synthetic holdout macro F1 rather than asserting an unverified score. Its current synthetic demo score is 85%, above the numeric target, but that does not satisfy real-world model validation. The target must be evaluated on representative, appropriately approved historical data with a time-separated holdout and independently reviewed labels before making any performance claim.

### How are risk factors explained?

The dashboard ranks model split-importance values for attendance, midterm, assignment delay, lab viva, and tutorial sessions. Importance summarizes model behavior in this synthetic prototype; it does not establish causation or explain an individual student's circumstances.

### What does the four-session simulation show?

It adjusts inputs by illustrative amounts, then compares the same model's estimated pass-likelihood proxy before and after the scenario. The assumptions are not estimated from intervention data, so this is not a causal impact estimate or guarantee.

### What happens when a faculty member uploads a CSV?

The page validates headers and numeric values, reads the file locally, replaces IDs for on-screen display, scores the cohort, and keeps the resulting data in browser memory only. Refreshing the page discards the import.

### Is replacing student IDs sufficient anonymization?

No. It is pseudonymization only. The source file may contain identifying or sensitive data and should not be uploaded unless the institution has approved the use, data minimization, access, and retention approach.

### Does the tool email the student automatically?

No. It drafts a supportive message that a faculty member can edit, copy, or open in a local email client. Sending remains a human decision.

### What are the monthly reports and are they sent automatically?

The demo calculates monthly-style cohort averages and a selected student's attendance, midterm, lab-viva, and assignment-delay snapshot, then previews separate student and faculty messages. It shows the current calendar month's end as the planned report date. It does not keep month-by-month history, run a background scheduler, have recipient email addresses, or send email. Real delivery requires an approved recipient mapping, consent and privacy controls, and a secure server-side scheduler and mail provider.

### How does faculty sign-in work in the demo?

Faculty enters the demo email `mentor@bbit.edu` and code `123456`, displayed on the page. This is simulated and does not send email or provide security. Backend authentication is deferred.

### How does a student access the portal?

Faculty signs in to the Faculty demo dashboard and turns student access ON/OFF directly using the portal-controls button. The setting is shared by the pages through this browser's local storage. A sample student enters roll `27600125001` and DOB `2005-01-15`; faculty can turn it OFF to demonstrate the closed state.

### Is roll number plus date of birth sufficient production authentication?

No. These demo credentials are fictional and the simulated login is not an authentication control. Do not use real data. A future live version should use institution-approved authentication, preferably student SSO or an approved second factor, HTTPS, monitoring, and a security/privacy review.

### Does the student portal show month-by-month history?

No. It displays a latest-snapshot demo row. Earlier months are not retained. Faculty monthly report cards and email messages elsewhere in the dashboard are previews; no month-end schedule or automatic student report is sent.

### Why are uploaded demo-roster students not in faculty risk predictions?

The student portal uses its own sample roster, while the faculty dashboard's risk model uses a separate synthetic demo cohort. A later live connection would require an approved data and model-validation workflow.

### What would you do next?

Co-design with students and mentors; obtain institutional privacy and ethics approval; define labels and an intervention protocol; validate on representative, time-separated cohorts; examine subgroup performance and calibration; run a prospective evaluation; and add secure access, auditing, retention controls, and monitoring before handling real data.
