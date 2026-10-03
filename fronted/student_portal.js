"use strict";

const STUDENT_DEMO_SESSION = "saarthiDemoStudentRoll";
const byId = id => document.getElementById(id);
let displayedPhotoUrl = "";
let displayedPhotoRollNumber = "";

function setStudentPhoto(photo, rollNumber) {
  if (displayedPhotoUrl) URL.revokeObjectURL(displayedPhotoUrl);
  displayedPhotoUrl = photo ? URL.createObjectURL(photo) : "";
  displayedPhotoRollNumber = rollNumber || "";
  byId("student-own-photo-image").hidden = !displayedPhotoUrl;
  byId("student-own-photo-initials").hidden = Boolean(displayedPhotoUrl);
  byId("student-own-photo-remove").hidden = !photo;
  if (displayedPhotoUrl) byId("student-own-photo-image").src = displayedPhotoUrl;
  else byId("student-own-photo-image").removeAttribute("src");
}

async function loadStudentPhoto(rollNumber, studentName) {
  if (displayedPhotoRollNumber === rollNumber) return;
  byId("student-own-photo-initials").textContent = studentName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
  byId("student-own-photo-status").textContent = "Loading saved photo…";
  try {
    const photo = await window.SaarthiDemo.readStudentPhoto(rollNumber);
    if (sessionStorage.getItem(STUDENT_DEMO_SESSION) !== rollNumber || byId("student-dashboard").hidden) return;
    setStudentPhoto(photo, rollNumber);
    byId("student-own-photo-status").textContent = photo ? "Your saved photo is ready." : "No photo uploaded yet.";
  } catch (error) {
    byId("student-own-photo-status").textContent = error.message || "Could not load your saved photo.";
  }
}

async function saveStudentPhoto(file) {
  if (!file) return;
  const rollNumber = sessionStorage.getItem(STUDENT_DEMO_SESSION);
  if (!rollNumber) return;
  const status = byId("student-own-photo-status");
  status.textContent = "Preparing your photo…";
  try {
    const photo = await window.SaarthiDemo.createPassportPhoto(file);
    await window.SaarthiDemo.writeStudentPhoto(rollNumber, photo);
    if (sessionStorage.getItem(STUDENT_DEMO_SESSION) !== rollNumber || byId("student-dashboard").hidden) return;
    setStudentPhoto(photo, rollNumber);
    status.textContent = "Photo saved in this browser. Your faculty can now view it.";
  } catch (error) {
    status.textContent = error.message || "Could not save your photo.";
  }
}

async function removeStudentPhoto() {
  const rollNumber = sessionStorage.getItem(STUDENT_DEMO_SESSION);
  if (!rollNumber) return;
  const status = byId("student-own-photo-status");
  status.textContent = "Removing your photo…";
  try {
    await window.SaarthiDemo.removeStudentPhoto(rollNumber);
    if (sessionStorage.getItem(STUDENT_DEMO_SESSION) !== rollNumber || byId("student-dashboard").hidden) return;
    setStudentPhoto(null, rollNumber);
    status.textContent = "Your photo has been removed from this browser.";
  } catch (error) {
    status.textContent = error.message || "Could not remove your photo.";
  }
}

function setLoginMessage(message, isError = true) {
  const messageElement = byId("student-login-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("is-success", !isError && Boolean(message));
}

function updatePortalStatus(enabled, message) {
  const status = byId("student-portal-status");
  const submit = byId("student-login-submit");
  status.textContent = message;
  status.classList.toggle("is-open", enabled);
  status.classList.toggle("is-closed", !enabled);
  status.classList.remove("is-error");
  submit.disabled = !enabled;
  submit.textContent = enabled ? "Sign in to your demo dashboard" : "Student portal is closed";
  byId("student-roll-number").disabled = !enabled;
  byId("student-date-of-birth").disabled = !enabled;
}

function clearStudentPhoto() {
  if (displayedPhotoUrl) URL.revokeObjectURL(displayedPhotoUrl);
  displayedPhotoUrl = "";
  displayedPhotoRollNumber = "";
  byId("student-own-photo-image").hidden = true;
  byId("student-own-photo-image").removeAttribute("src");
  byId("student-own-photo-initials").hidden = false;
  byId("student-own-photo-remove").hidden = true;
  byId("student-own-photo-status").textContent = "";
}

function setProgress(id, value, maximum = 100) {
  const percentage = Math.max(0, Math.min(100, Number(value) / maximum * 100));
  byId(id).style.width = `${percentage}%`;
}

function findStudent(rollNumber) {
  return window.SaarthiDemo.readRoster().find(student => student.student_id === rollNumber);
}

function renderStudent(student) {
  const attendance = Number(student.attendance_pct);
  const midterm = Number(student.midterm_score);
  const labViva = Number(student.lab_viva_score);
  const lateDays = Number(student.assignment_delay_days);
  const overall = Math.round((attendance + midterm + labViva) / 3);
  const updated = student.updatedAt ? new Date(student.updatedAt) : new Date();
  const reportedMonth = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(updated);

  byId("student-name").textContent = student.student_name;
  byId("student-roll-display").textContent = student.student_id;
  byId("student-department").textContent = student.department || "Unspecified";
  byId("student-academic-term").textContent = student.academic_year && student.semester
    ? ` · Year ${student.academic_year} · Semester ${student.semester}`
    : "";
  byId("student-month").textContent = `${reportedMonth} · Demo snapshot`;
  byId("student-attendance").textContent = `${Math.round(attendance)}%`;
  byId("student-midterm").textContent = `${Math.round(midterm)}%`;
  byId("student-lab").textContent = `${Math.round(labViva)}%`;
  byId("student-delay").textContent = `${lateDays.toFixed(1)} days`;
  byId("student-overall-score").textContent = `${overall}%`;
  setProgress("student-attendance-bar", attendance);
  setProgress("student-midterm-bar", midterm);
  setProgress("student-lab-bar", labViva);
  setProgress("student-delay-bar", lateDays, 10);
  byId("student-last-updated").textContent = student.updatedAt
    ? `Demo record last updated ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(updated)}.`
    : "Sample record · fictional demo data only.";
  byId("student-login-panel").hidden = true;
  byId("student-dashboard").hidden = false;
  loadStudentPhoto(student.student_id, student.student_name);
}

function showSignedInStudent() {
  if (!window.SaarthiDemo.readPortalEnabled()) {
    sessionStorage.removeItem(STUDENT_DEMO_SESSION);
    clearStudentPhoto();
    byId("student-dashboard").hidden = true;
    byId("student-login-panel").hidden = false;
    updatePortalStatus(false, "The demo student portal is closed. Ask faculty to turn it on in the dashboard.");
    return;
  }
  const rollNumber = sessionStorage.getItem(STUDENT_DEMO_SESSION);
  if (!rollNumber) return;
  const student = findStudent(rollNumber);
  if (!student) {
    sessionStorage.removeItem(STUDENT_DEMO_SESSION);
    return;
  }
  renderStudent(student);
}

function checkPortalStatus() {
  const enabled = window.SaarthiDemo.readPortalEnabled();
  updatePortalStatus(
    enabled,
    enabled
      ? "Demo portal is open. Use the sample credentials or an account from a demo roster upload."
      : "Demo portal is currently closed. Open the faculty dashboard and switch Student portal ON."
  );
  if (!enabled) {
    sessionStorage.removeItem(STUDENT_DEMO_SESSION);
    clearStudentPhoto();
    byId("student-dashboard").hidden = true;
    byId("student-login-panel").hidden = false;
    return;
  }
  showSignedInStudent();
}

byId("fill-demo-credentials").addEventListener("click", () => {
  byId("student-roll-number").value = "27600125001";
  byId("student-date-of-birth").value = "2005-01-15";
  setLoginMessage("Sample demo account filled in. No real student record is used.", false);
});

byId("student-login-form").addEventListener("submit", event => {
  event.preventDefault();
  setLoginMessage("");
  if (!window.SaarthiDemo.readPortalEnabled()) {
    checkPortalStatus();
    return;
  }
  const rollNumber = byId("student-roll-number").value.trim();
  const dateOfBirth = byId("student-date-of-birth").value;
  const student = findStudent(rollNumber);
  if (!student || student.date_of_birth !== dateOfBirth) {
    setLoginMessage("That demo roll number and date of birth do not match. Use the sample credentials shown above.");
    return;
  }
  sessionStorage.setItem(STUDENT_DEMO_SESSION, rollNumber);
  renderStudent(student);
});

byId("student-sign-out").addEventListener("click", () => {
  sessionStorage.removeItem(STUDENT_DEMO_SESSION);
  clearStudentPhoto();
  byId("student-dashboard").hidden = true;
  byId("student-login-panel").hidden = false;
  byId("student-login-form").reset();
  setLoginMessage("Signed out of the demo portal.", false);
  checkPortalStatus();
});

byId("student-own-photo-input").addEventListener("change", event => {
  const input = event.currentTarget;
  const file = input.files[0];
  input.value = "";
  saveStudentPhoto(file);
});
byId("student-own-photo-remove").addEventListener("click", removeStudentPhoto);

window.addEventListener("storage", event => {
  if (event.key === "saarthiDemoPortalEnabled" || event.key === "saarthiDemoRoster") checkPortalStatus();
});
window.setInterval(checkPortalStatus, 2500);
checkPortalStatus();
