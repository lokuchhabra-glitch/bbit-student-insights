"use strict";

const DEMO_FACULTY_EMAIL = "year1@bbit.edu";
const DEMO_FACULTY_CODE = "123456";
const DEMO_FACULTY_SESSION = "saarthiDemoFaculty";
const $ = id => document.getElementById(id);
const emailForm = $("step-1-form");
const codeForm = $("step-2-form");
const emailInput = $("email");
const codeInput = $("verification-code");
const notification = $("notification");
let currentEmail = "";
let currentFaculty = null;

function showNotification(message, type = "info") {
  notification.className = "mb-6 p-4 rounded-lg text-sm font-medium flex items-start gap-3 slide-up";
  $("notif-text").textContent = message;
  const icon = $("notif-icon");
  if (type === "error") {
    notification.classList.add("bg-red-50", "text-red-700", "border", "border-red-200");
    icon.className = "fa-solid fa-circle-exclamation mt-0.5 text-red-500";
  } else if (type === "success") {
    notification.classList.add("bg-green-50", "text-green-700", "border", "border-green-200");
    icon.className = "fa-solid fa-circle-check mt-0.5 text-green-500";
  } else {
    notification.classList.add("bg-blue-50", "text-blue-700", "border", "border-blue-200");
    icon.className = "fa-solid fa-circle-info mt-0.5 text-blue-500";
  }
}

function showFacultyDashboard() {
  $("step-1-form").classList.add("hidden");
  $("step-2-form").classList.add("hidden");
  $("notification").classList.add("hidden");
  $("faculty-dashboard").classList.remove("hidden");
  $("student-portal-shortcut").classList.add("hidden");
  currentEmail = sessionStorage.getItem(DEMO_FACULTY_SESSION) || DEMO_FACULTY_EMAIL;
  currentFaculty = window.SaarthiDemo.getFacultyAccount(currentEmail);
  if (!currentFaculty) {
    sessionStorage.removeItem(DEMO_FACULTY_SESSION);
    $("faculty-dashboard").classList.add("hidden");
    emailForm.classList.remove("hidden");
    showNotification("This demo email is not assigned to a faculty year. Choose one of the four listed emails.", "error");
    return;
  }
  $("step-subtitle").textContent = currentFaculty
    ? `Year ${currentFaculty.academicYear} faculty · ${currentEmail}`
    : `Signed in as ${currentEmail}`;
  updateFacultyPortalStatus();
}

function updateFacultyPortalStatus() {
  if (!window.SaarthiDemo) return;
  const enabled = window.SaarthiDemo.readPortalEnabled();
  const updatedAt = window.SaarthiDemo.readPortalUpdatedAt();
  const status = $("faculty-page-portal-status");
  status.textContent = enabled ? "ON · Students can sign in" : "OFF · Student sign-in is closed";
  status.classList.toggle("is-open", enabled);
  status.classList.toggle("is-closed", !enabled);
  $("faculty-page-portal-updated").textContent = updatedAt
    ? `Last changed ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(updatedAt))}`
    : "Turn it on when you are ready for students to view their demo dashboard.";
  const button = $("faculty-page-portal-toggle");
  button.disabled = false;
  button.textContent = enabled ? "Turn student portal OFF" : "Turn student portal ON";
  button.setAttribute("aria-pressed", String(enabled));
  $("faculty-portal-availability").classList.toggle("hidden", !enabled);
  $("student-portal-shortcut").classList.toggle("hidden", !enabled);
}

emailInput.value = DEMO_FACULTY_EMAIL;
showNotification("Choose the faculty email assigned to your year. Demo verification code: 123456. No email is sent.");

emailForm.addEventListener("submit", event => {
  event.preventDefault();
  currentEmail = emailInput.value.trim();
  if (!currentEmail) {
    showNotification("Enter an email address to continue.", "error");
    return;
  }
  currentFaculty = window.SaarthiDemo.getFacultyAccount(currentEmail);
  if (!currentFaculty) {
    showNotification("This email is not assigned to a faculty year. Use one of the four demo faculty emails shown above.", "error");
    return;
  }
  $("display-email").textContent = currentEmail;
  $("step-subtitle").textContent = `Year ${currentFaculty.academicYear} faculty verification`;
  emailForm.classList.add("hidden");
  codeForm.classList.remove("hidden");
  codeForm.classList.add("slide-up");
  showNotification(`Year ${currentFaculty.academicYear} faculty · demo only: enter ${DEMO_FACULTY_CODE}. This code is not emailed.`);
  codeInput.focus();
});

codeForm.addEventListener("submit", event => {
  event.preventDefault();
  if (codeInput.value.trim() !== DEMO_FACULTY_CODE) {
    showNotification(`That demo code is incorrect. Enter ${DEMO_FACULTY_CODE}.`, "error");
    codeInput.value = "";
    codeInput.focus();
    return;
  }
  if (!window.SaarthiDemo.getFacultyAccount(currentEmail)) {
    showNotification("This faculty email is not assigned to a year. Start again with an assigned faculty email.", "error");
    return;
  }
  sessionStorage.setItem(DEMO_FACULTY_SESSION, currentEmail);
  showFacultyDashboard();
});

$("btn-back").addEventListener("click", () => {
  codeForm.classList.add("hidden");
  emailForm.classList.remove("hidden");
  $("step-subtitle").textContent = "Demo access for faculty";
  codeInput.value = "";
});

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "");
});

$("faculty-page-portal-toggle").addEventListener("click", () => {
  const enabled = !window.SaarthiDemo.readPortalEnabled();
  if (!window.SaarthiDemo.writePortal(enabled)) {
    $("faculty-page-portal-updated").textContent = "Could not save the setting. Browser storage may be disabled.";
    return;
  }
  updateFacultyPortalStatus();
});

$("faculty-page-signout").addEventListener("click", () => {
  sessionStorage.removeItem(DEMO_FACULTY_SESSION);
  $("faculty-dashboard").classList.add("hidden");
  $("step-1-form").classList.remove("hidden");
  $("step-subtitle").textContent = "Demo access for faculty";
  $("student-portal-shortcut").classList.remove("hidden");
});

window.addEventListener("storage", event => {
  if (event.key === "saarthiDemoPortalEnabled" || event.key === "saarthiDemoPortalEnabled:updatedAt") {
    updateFacultyPortalStatus();
  }
});

if (sessionStorage.getItem(DEMO_FACULTY_SESSION)) showFacultyDashboard();
