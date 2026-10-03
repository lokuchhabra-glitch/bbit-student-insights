# Deployment

## Current: browser-only demo

No Node server, MongoDB, email account, or dependency install is required to walk through the current prototype.

1. Open `Fronted\faculty\index.html` in a browser.
2. Use the demo login shown on the page: `mentor@bbit.edu`, code `123456`. No email is sent.
3. After faculty demo sign-in, use the **Student portal controls** section on the faculty page and switch access ON/OFF there.
4. Open `Fronted\student\index.html` in the same browser and try sample roll `27600125001`, DOB `2005-01-15`. The page also has a button to fill in those sample details.
5. Return to faculty dashboard and turn the portal OFF to see the student-closed state.

The browser stores the demo portal switch and any demo roster CSV rows in local storage so they can be shared between pages. Browser settings or `file://` restrictions may isolate/disable storage; if so, use VS Code Live Server or another static server pointed at `Fronted\`. Demo login, DOB handling, and browser storage are not secure. Use only fictional data.

## Later: backend integration

The `backend\` directory contains an API prototype but is **not connected to the current frontend demo**. Do not run it as the means of accessing the current demo. Once the user approves moving to live-backend integration:

1. Review and validate the backend independently.
2. Provision an institution-approved MongoDB database and email account, configure `backend\.env` from `.env.example`, and install backend dependencies.
3. Replace browser demo login/storage with authenticated API calls and verify all user flows, privacy controls, and access behavior before using any real data.
4. Deploy over HTTPS only after institutional security/privacy review.

The existing browser-dashboard cohort/model is synthetic. Automatic month-end email reports and historical monthly snapshots are not implemented.

## Production readiness: not ready

Before handling real student data, require approved privacy basis and notice, secure authentication (prefer institutional SSO), HTTPS, server-side access controls, encryption, managed secrets, auditing, rate limiting, retention/deletion rules, backups, monitoring, threat modeling, and a security review. Validate model quality and fairness on representative, approved historical data. Do not use model output as the sole basis for high-stakes decisions.
