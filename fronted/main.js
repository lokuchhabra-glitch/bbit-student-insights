"use strict";
const FEATURES = ["attendance_pct", "midterm_score", "assignment_delay_days", "lab_viva_score", "tutorial_sessions"];
const FEATURE_LABELS = {
  attendance_pct: "Attendance",
  midterm_score: "Midterm performance",
  assignment_delay_days: "Assignment delays",
  lab_viva_score: "Lab viva",
  tutorial_sessions: "Tutorial sessions"
};
const COLORS = { Safe: "#358c68", Moderate: "#d49432", High: "#d86567" };
const WEEKS = 8;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let students = [];
let allStudents = [];
let forest = [];
let modelImportance = [];
let toastTimer;
let selectedStudentId = null;
let scrollRevealObserver;
let activeStudentPhotoUrl = "";
let facultyYear = 1;
let selectedSemester = 1;
let selectedMonth = "overview";
let monthlyRecords = [];

function semesterRangeForYear(year) {
  return [year * 2 - 1, year * 2];
}

function setSemesterOptions(year) {
  const semesters = semesterRangeForYear(year);
  $("#term-select").innerHTML = semesters
    .map(semester => `<option value="${semester}">Semester ${semester}</option>`)
    .join("");
  selectedSemester = semesters[0];
  $("#term-select").value = String(selectedSemester);
}

function reportingPeriodLabel() {
  return selectedMonth === "overview"
    ? `Semester ${selectedSemester} overview`
    : `Semester ${selectedSemester} · Month ${selectedMonth}`;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function shuffle(values, rand) {
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function riskScore(row) {
  return (100 - row.attendance_pct) * .30
    + (100 - row.midterm_score) * .31
    + Math.min(row.assignment_delay_days, 20) * 1.15
    + (100 - row.lab_viva_score) * .22
    - row.tutorial_sessions * 1.65;
}
function syntheticRisk(row) {
  const score = riskScore(row);
  return score >= 45 ? "High" : score >= 28 ? "Moderate" : "Safe";
}
function generateTrainingRows(count = 1600) {
  const rand = seededRandom(84271);
  return Array.from({ length: count }, () => {
    const row = {
      attendance_pct: 30 + rand() * 70,
      midterm_score: 20 + rand() * 80,
      assignment_delay_days: rand() * 16,
      lab_viva_score: 20 + rand() * 80,
      tutorial_sessions: Math.floor(rand() * 8)
    };
    if (rand() < .12) row.attendance_pct = clamp(row.attendance_pct - rand() * 24, 0, 100);
    if (rand() < .1) row.midterm_score = clamp(row.midterm_score - rand() * 30, 0, 100);
    row.risk_status = syntheticRisk(row);
    return row;
  });
}

function gini(rows) {
  if (!rows.length) return 0;
  const counts = { Safe: 0, Moderate: 0, High: 0 };
  rows.forEach(row => counts[row.risk_status]++);
  return 1 - Object.values(counts).reduce((total, count) => total + (count / rows.length) ** 2, 0);
}
function trainTree(rows, featureIndices, rand, importance, depth = 0) {
  const positives = { Safe: 0, Moderate: 0, High: 0 };
  rows.forEach(row => positives[row.risk_status]++);
  const predicted = Object.keys(positives).sort((a, b) => positives[b] - positives[a])[0];
  if (depth >= 10 || rows.length < 9 || positives[predicted] === rows.length) {
    return { prediction: predicted, probabilities: normalizeCounts(positives, rows.length) };
  }
  const parentGini = gini(rows);
  let best = null;
  const chosen = shuffle([...featureIndices], rand).slice(0, Math.min(3, featureIndices.length));
  for (const featureIndex of chosen) {
    const feature = FEATURES[featureIndex];
    const sorted = [...rows].sort((a, b) => a[feature] - b[feature]);
    for (let i = 4; i < sorted.length - 4; i += Math.max(1, Math.floor(sorted.length / 24))) {
      const leftValue = sorted[i][feature];
      const rightValue = sorted[i + 1][feature];
      if (leftValue === rightValue) continue;
      const threshold = (leftValue + rightValue) / 2;
      const left = sorted.slice(0, i + 1);
      const right = sorted.slice(i + 1);
      const gain = parentGini - (left.length * gini(left) + right.length * gini(right)) / rows.length;
      if (!best || gain > best.gain) best = { featureIndex, threshold, left, right, gain };
    }
  }
  if (!best || best.gain < .002) return { prediction: predicted, probabilities: normalizeCounts(positives, rows.length) };
  importance[best.featureIndex] += best.gain * rows.length;
  return {
    featureIndex: best.featureIndex,
    threshold: best.threshold,
    left: trainTree(best.left, featureIndices, rand, importance, depth + 1),
    right: trainTree(best.right, featureIndices, rand, importance, depth + 1)
  };
}
function normalizeCounts(counts, total) {
  return Object.fromEntries(["Safe", "Moderate", "High"].map(label => [label, total ? counts[label] / total : 0]));
}
function treePrediction(tree, row) {
  if (tree.prediction) return tree;
  return treePrediction(row[FEATURES[tree.featureIndex]] <= tree.threshold ? tree.left : tree.right, row);
}
function trainModel() {
  const rand = seededRandom(17417);
  const all = shuffle(generateTrainingRows(), rand);
  const split = Math.floor(all.length * .8);
  const trainRows = all.slice(0, split);
  const testRows = all.slice(split);
  const importance = Array(FEATURES.length).fill(0);
  forest = Array.from({ length: 31 }, (_, index) => {
    const treeRand = seededRandom(383 + index * 193);
    const sample = Array.from({ length: trainRows.length }, () => trainRows[Math.floor(treeRand() * trainRows.length)]);
    return trainTree(sample, FEATURES.map((_, featureIndex) => featureIndex), treeRand, importance);
  });
  modelImportance = importance.map((value, index) => ({ feature: FEATURES[index], value })).sort((a, b) => b.value - a.value);
  return macroF1(testRows);
}
function predict(row) {
  const votes = { Safe: 0, Moderate: 0, High: 0 };
  forest.forEach(tree => votes[treePrediction(tree, row).prediction]++);
  const probabilities = normalizeCounts(votes, forest.length);
  const status = Object.keys(probabilities).sort((a, b) => probabilities[b] - probabilities[a])[0];
  return { status, probabilities };
}
function macroF1(testRows) {
  let scores = [];
  for (const label of ["Safe", "Moderate", "High"]) {
    let tp = 0, fp = 0, fn = 0;
    testRows.forEach(row => {
      const predicted = predict(row).status;
      if (row.risk_status === label && predicted === label) tp++;
      else if (row.risk_status !== label && predicted === label) fp++;
      else if (row.risk_status === label && predicted !== label) fn++;
    });
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    scores.push(2 * precision * recall / (precision + recall || 1));
  }
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function buildWeeks(rand, risk, row) {
  let attendance = row.attendance_pct + (risk === "High" ? 11 : risk === "Moderate" ? 6 : 2);
  let tests = row.midterm_score + (risk === "High" ? 14 : risk === "Moderate" ? 7 : 1);
  return Array.from({ length: WEEKS }, (_, index) => ({
    week: index + 1,
    attendance: Math.round(clamp(attendance - index * (risk === "High" ? 2.1 : risk === "Moderate" ? 1 : .25) + (rand() - .5) * 7, 20, 100)),
    score: Math.round(clamp(tests - index * (risk === "High" ? 2.6 : risk === "Moderate" ? 1.15 : .35) + (rand() - .5) * 11, 10, 100))
  }));
}
function makeDemoStudents() {
  const rand = seededRandom(61824);
  const departments = ["Computer Science", "Electronics", "Mechanical", "Civil"];
  const firstNames = ["Aarav", "Aditi", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya", "Meera", "Neha", "Rohan", "Saanvi", "Vihaan"];
  const lastNames = ["Sharma", "Patel", "Singh", "Gupta", "Kumar", "Rao", "Joshi", "Das", "Nair", "Verma", "Shah", "Iyer"];
  return Array.from({ length: 44 }, (_, index) => {
    const profile = index % 10;
    const row = {
      attendance_pct: Math.round(clamp(87 - profile * 4.2 + (rand() - .5) * 16, 34, 99)),
      midterm_score: Math.round(clamp(84 - profile * 4.9 + (rand() - .5) * 19, 24, 98)),
      assignment_delay_days: Math.round(clamp(profile * 1.35 + rand() * 4, 0, 18) * 10) / 10,
      lab_viva_score: Math.round(clamp(85 - profile * 4.25 + (rand() - .5) * 20, 22, 99)),
      tutorial_sessions: Math.floor(rand() * 4),
      department: departments[index % departments.length]
    };
    const prediction = predict(row);
    const student = {
      ...row,
      id: `STU-${String(index + 1).padStart(4, "0")}`,
      name: `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length)]}`,
      academic_year: Math.min(4, Math.floor(index / 11) + 1),
      semester: facultyYear * 2 - (index % 11 < 6 ? 1 : 0),
      risk: prediction.status,
      probabilities: prediction.probabilities,
      weeks: []
    };
    student.weeks = buildWeeks(rand, student.risk, student);
    return student;
  });
}
function riskClass(risk) { return risk === "High" ? "risk-high" : risk === "Moderate" ? "risk-moderate" : "risk-safe"; }
function formatRisk(risk) { return risk === "Safe" ? "Safe" : `${risk} risk`; }
function renderTable(targetId, query, riskFilter) {
  const target = $(`#${targetId}`);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = students.filter(student =>
    (!normalizedQuery || student.id.toLowerCase().includes(normalizedQuery) || student.name.toLowerCase().includes(normalizedQuery) || student.department.toLowerCase().includes(normalizedQuery))
    && (riskFilter === "all" || student.risk === riskFilter)
  ).sort((a, b) => ["High", "Moderate", "Safe"].indexOf(a.risk) - ["High", "Moderate", "Safe"].indexOf(b.risk));
  const emptyState = students.length === 0 && selectedMonth !== "overview"
    ? `No data uploaded for Month ${selectedMonth} yet. Choose Import data to add this snapshot.`
    : "No students match those filters.";
  target.innerHTML = filtered.length ? filtered.slice(0, 10).map(student => `
    <tr data-student-id="${student.id}" tabindex="0">
      <td><div class="student-id">${escapeHtml(student.name)}</div><div class="student-dept">${escapeHtml(student.id)} · ${escapeHtml(student.department)}</div></td>
      <td><span class="risk-pill ${riskClass(student.risk)}">${formatRisk(student.risk)}</span></td>
      <td><div class="progress-inline"><span>${student.attendance_pct}%</span><i class="progress-mini"><span style="width:${student.attendance_pct}%;background:${student.attendance_pct < 65 ? "#d86567" : "#7cb7a1"}"></span></i></div></td>
      <td>${student.midterm_score}%</td><td>${student.assignment_delay_days} days</td><td>${student.lab_viva_score}%</td><td class="row-arrow">›</td>
    </tr>`).join("") : `<tr><td colspan="7"><div class="empty-state">${emptyState}</div></td></tr>`;
  $("#visible-count").textContent = `${filtered.length} student${filtered.length === 1 ? "" : "s"}`;
  $("#table-footer-count").textContent = `Showing ${Math.min(filtered.length, 10)} of ${filtered.length}`;
  $$("#student-grid .student-card").forEach(card => {
    const student = students.find(item => item.id === card.dataset.studentId);
    card.hidden = !student || !((!normalizedQuery || student.id.toLowerCase().includes(normalizedQuery) || student.department.toLowerCase().includes(normalizedQuery)) && (riskFilter === "all" || student.risk === riskFilter));
  });
}
function renderCards() {
  const query = $("#student-search").value.trim().toLowerCase();
  const risk = $("#student-risk-filter").value;
  const department = $("#department-filter").value;
  const filtered = students.filter(student =>
    (!query || student.id.toLowerCase().includes(query) || student.name.toLowerCase().includes(query) || student.department.toLowerCase().includes(query))
    && (risk === "all" || student.risk === risk)
    && (department === "all" || student.department === department)
  );
  const shown = filtered.slice(0, 120);
  $("#student-grid").innerHTML = shown.map(student => `
    <article class="card student-card" data-student-id="${student.id}" tabindex="0">
      <div class="student-card-head"><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.id)} · ${escapeHtml(student.department)}</p></div><span class="risk-pill ${riskClass(student.risk)}">${formatRisk(student.risk)}</span></div>
      <div class="student-card-stats"><div class="mini-stat"><span>Attendance</span><b>${student.attendance_pct}%</b></div><div class="mini-stat"><span>Midterm</span><b>${student.midterm_score}%</b></div><div class="mini-stat"><span>Lab viva</span><b>${student.lab_viva_score}%</b></div></div>
    </article>`).join("");
  if (filtered.length > shown.length) {
    $("#student-grid").insertAdjacentHTML("beforeend", `<p class="privacy-banner" style="grid-column:1/-1">Showing the first ${shown.length} of ${filtered.length.toLocaleString()} matches. Use search and filters to narrow the cohort.</p>`);
  } else if (!shown.length) {
    const emptyState = students.length === 0 && selectedMonth !== "overview"
      ? `No data uploaded for Month ${selectedMonth} yet. Choose Import data to add this snapshot.`
      : "No students match those filters.";
    $("#student-grid").innerHTML = `<div class="card empty-state" style="grid-column:1/-1">${emptyState}</div>`;
  }
}
function renderPriorities() {
  const high = students.filter(student => student.risk === "High").slice(0, 5);
  $("#priority-list").innerHTML = high.length ? high.map((student, index) => `
    <div class="priority-item"><span class="priority-num">${index + 1}</span><div class="priority-copy"><strong>${escapeHtml(student.name)} · ${escapeHtml(student.id)}</strong><span>${student.attendance_pct}% attendance · ${student.midterm_score}% midterm</span></div><button class="button button-sm" data-open-student="${student.id}">Check in</button></div>`).join("") : `<div class="empty-state">No high-risk students in the current cohort. Keep encouraging consistent habits.</div>`;
  const select = $("#sim-student");
  const previous = selectedStudentId;
  const atRisk = students.filter(student => student.risk !== "Safe").sort((a, b) => ["High", "Moderate"].indexOf(a.risk) - ["High", "Moderate"].indexOf(b.risk));
  const candidates = atRisk.length ? atRisk : students;
  select.innerHTML = candidates.slice(0, 100).map(student => `<option value="${student.id}">${escapeHtml(student.name)} · ${escapeHtml(student.id)}</option>`).join("");
  if (candidates.some(student => student.id === previous)) select.value = previous;
  selectedStudentId = select.value || null;
  updateSimulation();
}
function renderImportance() {
  const max = modelImportance[0]?.value || 1;
  $("#importance-list").innerHTML = modelImportance.map(item => {
    const percentage = item.value / max * 100;
    return `<div><div class="importance-label"><span>${FEATURE_LABELS[item.feature]}</span><b>${Math.round(percentage)}%</b></div><div class="bar-track"><div class="bar-fill" style="width:${percentage}%"></div></div></div>`;
  }).join("");
}
function averageFor(key) {
  return students.length
    ? students.reduce((total, student) => total + student[key], 0) / students.length
    : 0;
}
function renderMonthlyEmails() {
  const student = students.find(item => item.id === $("#monthly-student").value);
  if (!student) {
    $("#monthly-student-email").textContent = "No student records are available for this report.";
    return;
  }
  const period = reportingPeriodLabel();
  const studentMessage = [
    `Subject: Your learning progress · ${period}`,
    "",
    `Hello ${student.name},`,
    "",
    `Here is a snapshot of your academic progress for ${period}:`,
    `• Attendance: ${student.attendance_pct}%`,
    `• Midterm score: ${student.midterm_score}%`,
    `• Lab viva score: ${student.lab_viva_score}%`,
    `• Average assignment delay: ${student.assignment_delay_days} days`,
    "",
    "These numbers are only one part of your semester. If you would like help or want to talk through any challenges, your faculty mentor is here to listen and explore support with you.",
    "",
    "Warmly,",
    "Your faculty mentor"
  ].join("\n");
  $("#monthly-student-email").textContent = studentMessage;

  const highRiskCount = students.filter(item => item.risk === "High").length;
  const moderateRiskCount = students.filter(item => item.risk === "Moderate").length;
  const facultyMessage = [
    `Subject: Monthly cohort progress summary · ${period}`,
    "",
    `Hello Faculty Mentor,`,
    "",
    `Here is the ${period} summary for your current cohort of ${students.length.toLocaleString()} students:`,
    `• Average attendance: ${averageFor("attendance_pct").toFixed(1)}%`,
    `• Average midterm score: ${averageFor("midterm_score").toFixed(1)}%`,
    `• Average lab viva score: ${averageFor("lab_viva_score").toFixed(1)}%`,
    `• Students with a high-support signal: ${highRiskCount}`,
    `• Students with a moderate-support signal: ${moderateRiskCount}`,
    "",
    "Please use these signals as prompts for private, supportive conversations—not as final judgements. Confirm the context with each student before planning next steps.",
    "",
    "BBIT · Demo report"
  ].join("\n");
  $("#monthly-faculty-email").textContent = facultyMessage;
}
function renderMonthlyReports() {
  $("#monthly-next-run").textContent = reportingPeriodLabel();
  $("#monthly-attendance").textContent = students.length ? `${averageFor("attendance_pct").toFixed(1)}%` : "—";
  $("#monthly-midterm").textContent = students.length ? `${averageFor("midterm_score").toFixed(1)}%` : "—";
  $("#monthly-lab").textContent = students.length ? `${averageFor("lab_viva_score").toFixed(1)}%` : "—";
  $("#monthly-total").textContent = students.length ? students.length.toLocaleString() : "—";
  const highCount = students.filter(student => student.risk === "High").length;
  const moderateCount = students.filter(student => student.risk === "Moderate").length;
  $("#monthly-risk-summary").textContent = students.length
    ? `${highCount} high · ${moderateCount} moderate support signals`
    : "No data uploaded for this period";

  const studentSelect = $("#monthly-student");
  const previousStudentId = studentSelect.value;
  studentSelect.innerHTML = students.map(student =>
    `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} · ${escapeHtml(student.id)}</option>`
  ).join("");
  if (students.some(student => student.id === previousStudentId)) studentSelect.value = previousStudentId;
  const selectedStudent = students.find(student => student.id === studentSelect.value);
  $("#monthly-student-recipient").textContent = selectedStudent
    ? `${selectedStudent.name} (${selectedStudent.id}) · email not configured`
    : "Student · email not configured";
  if (!students.length) {
    $("#monthly-student-email").textContent = `No records for ${reportingPeriodLabel()}. Select Import data, choose a month, and upload its CSV.`;
    $("#monthly-faculty-email").textContent = `No cohort data is available for ${reportingPeriodLabel()}.`;
    return;
  }
  renderMonthlyEmails();
}
function renderAll() {
  const count = { High: 0, Moderate: 0, Safe: 0 };
  students.forEach(student => count[student.risk]++);
  $("#high-count").textContent = count.High;
  $("#moderate-count").textContent = count.Moderate;
  $("#safe-count").textContent = count.Safe;
  $("#total-count").textContent = students.length;
  $("#risk-nav-count").textContent = count.High + count.Moderate;
  $("#alert-message").textContent = count.High ? `${count.High} students may appreciate a thoughtful check-in this week.` : "A small nudge, at the right moment, matters.";
  const departments = [...new Set(students.map(student => student.department))].sort();
  const currentDepartment = $("#department-filter").value;
  $("#department-filter").innerHTML = `<option value="all">All departments</option>${departments.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  if (departments.includes(currentDepartment)) $("#department-filter").value = currentDepartment;
  renderImportance();
  renderCards();
  renderPriorities();
  renderMonthlyReports();
  applyTableFilters();
  drawTrend();
}
function applyTableFilters() {
  renderTable("student-table", $("#overview-search").value, $("#overview-risk-filter").value);
  renderCards();
}
function drawTrend() {
  const canvas = $("#trend-chart");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const width = rect.width, height = rect.height, pad = { left: 38, right: 10, top: 12, bottom: 25 };
  const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom;
  const mode = $("#trend-metric").value;
  const weekly = Array.from({ length: WEEKS }, (_, index) => {
    const values = students.flatMap(student => student.weeks[index] ? [student.weeks[index]] : []);
    return {
      attendance: values.reduce((sum, item) => sum + item.attendance, 0) / (values.length || 1),
      score: values.reduce((sum, item) => sum + item.score, 0) / (values.length || 1)
    };
  });
  ctx.font = "10px Inter, sans-serif";
  ctx.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach(value => {
    const y = pad.top + plotHeight * (1 - value / 100);
    ctx.strokeStyle = "#edf0f3";
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = "#97a2ac"; ctx.textAlign = "right"; ctx.fillText(String(value), pad.left - 8, y + 3);
  });
  const xAt = index => pad.left + plotWidth * (index / (WEEKS - 1));
  const yAt = value => pad.top + plotHeight * (1 - value / 100);
  const line = (key, color, dash = false) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.3; ctx.setLineDash(dash ? [5, 5] : []);
    ctx.beginPath();
    weekly.forEach((value, index) => index ? ctx.lineTo(xAt(index), yAt(value[key])) : ctx.moveTo(xAt(index), yAt(value[key])));
    ctx.stroke(); ctx.setLineDash([]);
    weekly.forEach((value, index) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(xAt(index), yAt(value[key]), 3, 0, Math.PI * 2); ctx.fill(); });
  };
  if (mode !== "scores") line("attendance", "#53bdb5");
  if (mode !== "attendance") line("score", "#7188f0");
  if (mode !== "scores") line("attendance", "#ee8c9b", true);
  for (let week = 0; week < WEEKS; week++) {
    ctx.fillStyle = "#909ba5"; ctx.textAlign = "center"; ctx.fillText(`W${week + 1}`, xAt(week), height - 6);
  }
}
function drawStudentWeeks(weeks) {
  const canvas = $("#student-week-chart");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio);
  const w = rect.width, h = rect.height, p = { left: 34, right: 8, top: 10, bottom: 23 }, pw = w-p.left-p.right, ph = h-p.top-p.bottom;
  ctx.font = "9px Inter, sans-serif";
  [0,50,100].forEach(value => { const y=p.top+ph*(1-value/100); ctx.strokeStyle="#edf0f3";ctx.beginPath();ctx.moveTo(p.left,y);ctx.lineTo(w-p.right,y);ctx.stroke();ctx.fillStyle="#97a2ac";ctx.textAlign="right";ctx.fillText(String(value),p.left-6,y+3); });
  const x = i => p.left+pw*i/Math.max(1,weeks.length-1), y = value => p.top+ph*(1-value/100);
  for (const [key,color] of [["attendance","#53bdb5"],["score","#7188f0"]]) {
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();weeks.forEach((item,i)=>i?ctx.lineTo(x(i),y(item[key])):ctx.moveTo(x(i),y(item[key])));ctx.stroke();
    weeks.forEach((item,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(i),y(item[key]),3,0,Math.PI*2);ctx.fill();});
  }
  weeks.forEach((item,i)=>{ctx.fillStyle="#909ba5";ctx.textAlign="center";ctx.fillText(`W${item.week}`,x(i),h-5);});
}
function passLikelihood(row) {
  const { probabilities } = predict(row);
  return Math.round((probabilities.Safe + probabilities.Moderate * .58 + probabilities.High * .16) * 100);
}
function simulatedRow(student) {
  return {
    ...student,
    tutorial_sessions: student.tutorial_sessions + 4,
    attendance_pct: clamp(student.attendance_pct + (100 - student.attendance_pct) * .09, 0, 100),
    midterm_score: clamp(student.midterm_score + (100 - student.midterm_score) * .13, 0, 100),
    lab_viva_score: clamp(student.lab_viva_score + (100 - student.lab_viva_score) * .12, 0, 100),
    assignment_delay_days: Math.max(0, student.assignment_delay_days - 1.2)
  };
}
function updateSimulation() {
  const student = students.find(item => item.id === $("#sim-student").value);
  if (!student) { $("#sim-before").textContent = "—"; $("#sim-after").textContent = "—"; return; }
  selectedStudentId = student.id;
  $("#sim-before").textContent = `${passLikelihood(student)}%`;
  $("#sim-after").textContent = `${passLikelihood(simulatedRow(student))}%`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function setStudentPhoto(photo) {
  const image = $("#student-photo");
  const initials = $("#student-photo-initials");
  if (!image || !initials) return;
  if (activeStudentPhotoUrl) URL.revokeObjectURL(activeStudentPhotoUrl);
  activeStudentPhotoUrl = photo ? URL.createObjectURL(photo) : "";
  image.hidden = !activeStudentPhotoUrl;
  initials.hidden = Boolean(activeStudentPhotoUrl);
  if (activeStudentPhotoUrl) image.src = activeStudentPhotoUrl;
  else image.removeAttribute("src");
}
async function loadStudentPhoto(photoKey) {
  try {
    const photo = await window.SaarthiDemo.readStudentPhoto(photoKey);
    const modal = $("#student-modal");
    if (modal.classList.contains("open") && modal.dataset.photoStudentId === photoKey) setStudentPhoto(photo);
  } catch (error) {
    const status = $("#student-photo-status");
    const modal = $("#student-modal");
    if (status && modal.classList.contains("open") && modal.dataset.photoStudentId === photoKey) {
      status.textContent = error.message || "Could not load this student photo.";
    }
  }
}
function closeStudentModal() {
  $("#student-modal").classList.remove("open");
  if (activeStudentPhotoUrl) URL.revokeObjectURL(activeStudentPhotoUrl);
  activeStudentPhotoUrl = "";
}
function openStudent(id) {
  const student = students.find(item => item.id === id);
  if (!student) return;
  if (activeStudentPhotoUrl) URL.revokeObjectURL(activeStudentPhotoUrl);
  activeStudentPhotoUrl = "";
  const modal = $("#student-modal");
  modal.dataset.studentId = student.id;
  const rosterMatch = window.SaarthiDemo.readRoster().find(record => record.student_name === student.name);
  const photoKey = student.student_id || rosterMatch?.student_id || student.id;
  modal.dataset.photoStudentId = photoKey;
  $("#modal-student-name").textContent = student.name;
  $("#modal-subtitle").textContent = `${student.id} · ${student.department} · early-semester risk: ${student.risk.toLowerCase()}`;
  const weeklyTrend = student.weeks.findIndex((week, index) => index > 0 && (week.attendance < student.weeks[index-1].attendance - 9 || week.score < student.weeks[index-1].score - 12));
  const slipText = weeklyTrend >= 0 ? `Attendance or scores dipped noticeably around week ${weeklyTrend + 1}. Consider asking what changed that week.` : "No sharp week-to-week dip stands out; regular check-ins still matter.";
  const message = `Hello ${student.name},\n\nI wanted to check in and see how your semester is going. I noticed a few recent academic signals that may mean things have felt demanding. You have strengths we can build on, and support is available if you would find it useful.\n\nWould you be open to meeting for a short conversation about tutorial options and anything else that might help? There is no pressure — I would be glad to listen and work out a next step together.\n\nWarmly,\nAnanya Mehta`;
  const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  $("#modal-body").innerHTML = `
    <section class="student-photo-panel" aria-label="Student photo">
      <div class="student-photo-frame"><img id="student-photo" alt="Passport-size photo of ${escapeHtml(student.name)}" hidden><span id="student-photo-initials" aria-hidden="true">${escapeHtml(initials)}</span></div>
      <div class="student-photo-copy">
        <strong>Student photo</strong>
        <p>Student can add their passport-size photo from the BBIT student portal.</p>
        <p class="student-photo-status" id="student-photo-status" role="status" aria-live="polite"></p>
      </div>
    </section>
    <div class="detail-stats">
      <div class="detail-stat"><span>Risk assessment</span><b><span class="risk-pill ${riskClass(student.risk)}">${formatRisk(student.risk)}</span></b></div>
      <div class="detail-stat"><span>Attendance</span><b>${student.attendance_pct}%</b></div>
      <div class="detail-stat"><span>Midterm</span><b>${student.midterm_score}%</b></div>
      <div class="detail-stat"><span>Lab viva</span><b>${student.lab_viva_score}%</b></div>
    </div>
    <div class="detail-section-title">A closer look at the semester</div>
    <div class="week-chart"><canvas id="student-week-chart" aria-label="Weekly attendance and test scores for ${escapeHtml(student.name)}" role="img"></canvas></div>
    <div class="privacy-banner">${escapeHtml(slipText)} Delayed assignments: ${student.assignment_delay_days} days on average. Tutorial sessions attended: ${student.tutorial_sessions}.</div>
    <div class="detail-section-title">A gentle first message</div>
    <div class="email-draft" id="email-draft">${escapeHtml(message)}</div>
    <div class="modal-actions"><button class="button button-sm" id="copy-email">Copy draft</button><button class="button button-primary button-sm" id="open-email">Open in email</button></div>
    <p class="sim-footnote" style="margin-top:12px">This is a draft suggestion, not an automatically sent message. Review and personalize it before contacting a student. Risk estimates should not be used to make disciplinary or high-stakes decisions.</p>`;
  modal.classList.add("open");
  setStudentPhoto(null);
  loadStudentPhoto(photoKey);
  drawStudentWeeks(student.weeks);
  $("#copy-email").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(message); showToast("Draft copied. Make it your own before sending."); }
    catch (error) { showToast("Could not access the clipboard. Select and copy the draft manually."); }
  });
  $("#open-email").addEventListener("click", () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(`Checking in — ${student.name}`)}&body=${encodeURIComponent(message)}`;
  });
}
function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell); cell = "";
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("This CSV has an unclosed quoted field.");
  if (cell || row.length) { row.push(cell); if (row.some(value => value.trim() !== "")) rows.push(row); }
  if (rows.length < 2) throw new Error("The CSV must contain a header row and at least one student.");
  const headers = rows.shift().map(value => value.trim().replace(/^\uFEFF/, "").toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("The CSV has duplicate column names.");
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])));
}
function parseStudentRecords(text) {
  const records = parseCsv(text);
  const required = ["attendance_pct", "midterm_score", "assignment_delay_days", "lab_viva_score"];
  const headers = Object.keys(records[0] || {});
  const missing = required.filter(field => !headers.includes(field));
  if (missing.length) throw new Error(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);
  if (records.length > 20000) throw new Error("Please upload no more than 20,000 records at a time.");
  const studentIds = new Set();
  return records.map((record, index) => {
    const row = {};
    for (const feature of required) {
      const value = record[feature] === "" ? NaN : Number(record[feature]);
      if (!Number.isFinite(value)) throw new Error(`Row ${index + 2}: ${feature} must be a number.`);
      if (feature !== "assignment_delay_days" && (value < 0 || value > 100)) throw new Error(`Row ${index + 2}: ${feature} must be between 0 and 100.`);
      if (feature === "assignment_delay_days" && value < 0) throw new Error(`Row ${index + 2}: assignment_delay_days cannot be negative.`);
      row[feature] = value;
    }
    row.tutorial_sessions = record.tutorial_sessions === "" || record.tutorial_sessions === undefined ? 0 : Number(record.tutorial_sessions);
    if (!Number.isFinite(row.tutorial_sessions) || row.tutorial_sessions < 0 || row.tutorial_sessions > 100) throw new Error(`Row ${index + 2}: tutorial_sessions must be a number between 0 and 100.`);
    row.department = record.department?.trim() || "Unspecified";
    row.id = `STU-${String(index + 1).padStart(4, "0")}`;
    row.student_id = record.student_id?.trim() || "";
    if (row.student_id && studentIds.has(row.student_id)) {
      throw new Error(`Row ${index + 2}: duplicate student_id in this monthly file.`);
    }
    if (row.student_id) studentIds.add(row.student_id);
    row.name = record.student_name?.trim() || `Student ${String(index + 1).padStart(4, "0")}`;
    row.academic_year = record.academic_year === undefined || record.academic_year === ""
      ? facultyYear
      : Number(record.academic_year);
    row.semester = record.semester === undefined || record.semester === ""
      ? selectedSemester
      : Number(record.semester);
    if (!Number.isInteger(row.academic_year) || row.academic_year < 1 || row.academic_year > 4) {
      throw new Error(`Row ${index + 2}: academic_year must be between 1 and 4.`);
    }
    if (row.academic_year !== facultyYear) {
      throw new Error(`Row ${index + 2}: this faculty account can only import Year ${facultyYear} students.`);
    }
    if (!Number.isInteger(row.semester) || !semesterRangeForYear(facultyYear).includes(row.semester)) {
      throw new Error(`Row ${index + 2}: semester must be ${semesterRangeForYear(facultyYear).join(" or ")} for Year ${facultyYear}.`);
    }
    row.month_in_semester = record.month_in_semester === undefined || record.month_in_semester === ""
      ? Number(selectedMonth)
      : Number(record.month_in_semester);
    if (!Number.isInteger(row.month_in_semester) || row.month_in_semester < 1 || row.month_in_semester > 6) {
      throw new Error(`Row ${index + 2}: month_in_semester must be between 1 and 6.`);
    }
    if (selectedMonth === "overview" || row.month_in_semester !== Number(selectedMonth)) {
      throw new Error(`Row ${index + 2}: select Month ${row.month_in_semester} in the dashboard before uploading this monthly CSV.`);
    }
    const prediction = predict(row);
    row.risk = prediction.status;
    row.probabilities = prediction.probabilities;
    row.weeks = Array.from({ length: WEEKS }, (_, weekIndex) => ({
      week: weekIndex + 1,
      attendance: optionalPercentage(record, `attendance_week_${weekIndex + 1}`, row.attendance_pct),
      score: optionalPercentage(record, `test_week_${Math.floor(weekIndex / 2) + 1}`, row.midterm_score)
    }));
    return row;
  });
}
function optionalPercentage(record, field, fallback) {
  if (record[field] === undefined || record[field] === "") return Math.round(fallback);
  const value = Number(record[field]);
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${field} must be a number between 0 and 100.`);
  return value;
}
function setPortalStatus(enabled, enabledAt) {
  const badge = $("#faculty-portal-status");
  badge.textContent = enabled ? "Student portal is ON" : "Student portal is OFF";
  badge.classList.toggle("is-open", enabled);
  badge.classList.toggle("is-closed", !enabled);
  badge.classList.remove("is-error");
  $("#faculty-portal-window").textContent = enabled
    ? "Students can sign in using their roll number and date of birth."
    : "Student sign-in is currently disabled.";
  $("#faculty-portal-updated").textContent = enabledAt
    ? `Opened ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(enabledAt))}`
    : "It remains this way until you change the setting.";
  const toggle = $("#faculty-portal-toggle");
  toggle.disabled = false;
  toggle.textContent = enabled ? "Turn portal off" : "Turn portal on";
  toggle.dataset.enabled = String(enabled);
}
function loadPortalSettings() {
  const enabled = window.SaarthiDemo.readPortalEnabled();
  setPortalStatus(enabled, window.SaarthiDemo.readPortalUpdatedAt());
  $("#student-portal-nav-link").hidden = !enabled;
}
function toggleStudentPortal() {
  const toggle = $("#faculty-portal-toggle");
  const currentlyEnabled = toggle.dataset.enabled === "true";
  const enabled = !currentlyEnabled;
  if (!window.SaarthiDemo.writePortal(enabled)) {
    $("#faculty-portal-window").textContent = "Could not save demo setting in this browser.";
    showToast("Browser storage is unavailable. Try using a local web server.");
    return;
  }
  setPortalStatus(enabled, window.SaarthiDemo.readPortalUpdatedAt());
  $("#student-portal-nav-link").hidden = !enabled;
  showToast(enabled ? "Demo student portal is now open." : "Demo student portal is now closed.");
}
function downloadRosterTemplate() {
  const headers = [
    "student_name", "student_id", "date_of_birth", "academic_year", "semester", "department",
    "attendance_pct", "midterm_score", "assignment_delay_days",
    "lab_viva_score", "tutorial_sessions"
  ];
  const exampleRows = window.SaarthiDemo.sampleStudents
    .map(student => headers.map(header => csvCell(
      header === "academic_year" ? facultyYear
        : header === "semester" ? facultyYear * 2 - (student.semester === 1 ? 1 : 0)
          : student[header]
    )).join(","));
  const file = new Blob([[headers.join(","), ...exampleRows].join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bbit-demo-student-roster-template.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function downloadMonthlyTemplate() {
  if (selectedMonth === "overview") {
    selectedMonth = "1";
    $("#month-select").value = selectedMonth;
    updateActiveSemester();
    renderAll();
  }
  downloadCsv([{
    id: "ANON-001",
    name: "Demo Student",
    academic_year: facultyYear,
    semester: selectedSemester,
    month_in_semester: Number(selectedMonth),
    department: "Computer Science",
    attendance_pct: 72,
    midterm_score: 64,
    assignment_delay_days: 3,
    lab_viva_score: 68,
    tutorial_sessions: 1,
    risk: "Moderate",
    weeks: Array.from({ length: WEEKS }, (_, index) => ({
      week: index + 1,
      attendance: 75 - index,
      score: 68 - Math.floor(index / 2)
    }))
  }], "bbit-csv-template.csv");
}
async function uploadPortalRoster(file) {
  const message = $("#portal-roster-message");
  message.classList.remove("error");
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv")) {
    message.textContent = "Choose a CSV file.";
    message.classList.add("error");
    return;
  }
  if (file.size > 1024 * 1024) {
    message.textContent = "Roster CSV must be no larger than 1 MB.";
    message.classList.add("error");
    return;
  }
  try {
    const records = parseCsv(await file.text());
    if (records.length > 500) throw new Error("Upload no more than 500 student records at a time.");
    const required = [
      "student_name", "student_id", "date_of_birth", "attendance_pct",
      "midterm_score", "assignment_delay_days", "lab_viva_score"
    ];
    const headers = Object.keys(records[0] || {});
    const missing = required.filter(field => !headers.includes(field));
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
    const rollNumbers = new Set();
    const demoRecords = records.map((record, index) => {
      if (!/^27600125001\d{0,9}$/.test(record.student_id || "")) {
        throw new Error(`Row ${index + 2}: student_id must start with 27600125001.`);
      }
      const dateOfBirth = new Date(`${record.date_of_birth}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date_of_birth || "")
          || Number.isNaN(dateOfBirth.valueOf())
          || dateOfBirth.toISOString().slice(0, 10) !== record.date_of_birth
          || record.date_of_birth >= new Date().toISOString().slice(0, 10)) {
        throw new Error(`Row ${index + 2}: date_of_birth must use YYYY-MM-DD.`);
      }
      if (rollNumbers.has(record.student_id)) throw new Error(`Row ${index + 2}: duplicate student_id.`);
      rollNumbers.add(record.student_id);
      for (const field of required.slice(3)) {
        const value = Number(record[field]);
        if (!Number.isFinite(value) || value < 0 || (field !== "assignment_delay_days" && value > 100)) {
          throw new Error(`Row ${index + 2}: ${field} is outside the allowed range.`);
        }
      }
      const tutorialSessions = Number(record.tutorial_sessions || 0);
      if (!Number.isFinite(tutorialSessions) || tutorialSessions < 0 || tutorialSessions > 100) {
        throw new Error(`Row ${index + 2}: tutorial_sessions must be between 0 and 100.`);
      }
      const academicYear = record.academic_year ? Number(record.academic_year) : facultyYear;
      const semester = record.semester ? Number(record.semester) : selectedSemester;
      if (!Number.isInteger(academicYear) || academicYear < 1 || academicYear > 4) {
        throw new Error(`Row ${index + 2}: academic_year must be between 1 and 4.`);
      }
      if (academicYear !== facultyYear) {
        throw new Error(`Row ${index + 2}: this faculty account can only manage Year ${facultyYear} students.`);
      }
      if (!Number.isInteger(semester) || !semesterRangeForYear(facultyYear).includes(semester)) {
        throw new Error(`Row ${index + 2}: semester must be ${semesterRangeForYear(facultyYear).join(" or ")} for Year ${facultyYear}.`);
      }
      return {
        ...record,
        academic_year: academicYear,
        semester,
        tutorial_sessions: tutorialSessions,
        department: record.department || "Unspecified",
        updatedAt: new Date().toISOString(),
        demoOnly: true
      };
    });
    const oldRecords = JSON.parse(localStorage.getItem("saarthiDemoRoster") || "[]");
    const byRollNumber = new Map(oldRecords.map(record => [record.student_id, record]));
    demoRecords.forEach(record => byRollNumber.set(record.student_id, record));
    if (!window.SaarthiDemo.writeRoster([...byRollNumber.values()])) {
      throw new Error("Browser storage is unavailable. Try using a local web server.");
    }
    message.textContent = `${demoRecords.length} demo student account${demoRecords.length === 1 ? "" : "s"} added to this browser only. Do not upload real personal data.`;
    showToast("Demo roster upload complete.");
  } catch (error) {
    message.textContent = error.message || "Could not upload this roster.";
    message.classList.add("error");
  }
}
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function downloadCsv(rows, filename) {
  const headers = ["student_name", "student_id", "academic_year", "semester", "month_in_semester", "department", ...FEATURES, "risk_status", ...Array.from({ length: WEEKS }, (_, index) => `attendance_week_${index + 1}`), "test_week_1", "test_week_2", "test_week_3", "test_week_4"];
  const content = [headers.join(","), ...rows.map(student => headers.map(header => {
    if (header === "student_name") return csvCell(student.name);
    if (header === "student_id") return csvCell(student.student_id || student.id);
    if (header === "risk_status") return csvCell(student.risk.toLowerCase());
    if (header.startsWith("attendance_week_")) return csvCell(student.weeks[Number(header.slice(-1)) - 1]?.attendance ?? "");
    if (header.startsWith("test_week_")) {
      const week = Number(header.slice(-1));
      return csvCell(student.weeks[Math.min(7, (week - 1) * 2 + 1)]?.score ?? "");
    }
    return csvCell(student[header]);
  }).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename;
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
}
function setupScrollReveals() {
  if (!("IntersectionObserver" in window)) return;
  if (!scrollRevealObserver) {
    scrollRevealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        scrollRevealObserver.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: "0px 0px -35px 0px" });
  }
  $$(".view.active > *").forEach((element, index) => {
    if (element.classList.contains("scroll-reveal")) return;
    element.classList.add("scroll-reveal");
    element.style.setProperty("--reveal-delay", `${Math.min(index * 55, 220)}ms`);
    scrollRevealObserver.observe(element);
  });
}
function setView(name) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-button").forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  $("#crumb-name").textContent = ({ overview: "Overview", students: "Students", interventions: "Interventions", "monthly-reports": "Monthly reports", import: "Import data" })[name] || "Overview";
  window.scrollTo({ top: 0, behavior: "smooth" });
  setupScrollReveals();
  if (name === "overview") requestAnimationFrame(drawTrend);
}
async function handleFile(file) {
  const message = $("#upload-message");
  message.classList.remove("error");
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv")) { message.textContent = "Choose a .csv file."; message.classList.add("error"); return; }
  if (file.size > 10 * 1024 * 1024) { message.textContent = "File is larger than 10 MB. Please choose a smaller CSV."; message.classList.add("error"); return; }
  try {
    if (selectedMonth === "overview") {
      throw new Error("Choose Month 1–6 from the dashboard filter before uploading monthly data.");
    }
    const content = await file.text();
    const imported = parseStudentRecords(content);
    const monthlySnapshot = monthlyRecords.filter(record =>
      record.academic_year !== facultyYear
      || record.semester !== selectedSemester
      || record.month_in_semester !== Number(selectedMonth)
    );
    const updatedMonthlyRecords = [...monthlySnapshot, ...imported];
    if (!window.SaarthiDemo.writeMonthlyRecords(updatedMonthlyRecords)) {
      throw new Error("Could not save monthly data in this browser. Check browser storage and try again.");
    }
    monthlyRecords = updatedMonthlyRecords;
    updateActiveSemester();
    renderAll();
    message.textContent = `${imported.length.toLocaleString()} student record${imported.length === 1 ? "" : "s"} saved for Year ${facultyYear}, Semester ${selectedSemester}, Month ${selectedMonth}. Re-uploading this period replaces its previous snapshot; other months are unchanged.`;
    showToast("Your cohort is ready to explore.");
    setView("overview");
  } catch (error) {
    message.textContent = error.message || "We could not read this CSV.";
    message.classList.add("error");
  }
}
function initialize() {
  const facultyEmail = sessionStorage.getItem("saarthiDemoFaculty");
  const faculty = window.SaarthiDemo.getFacultyAccount(facultyEmail);
  if (!faculty) {
    window.location.replace("faculty/index.html");
    return;
  }
  facultyYear = faculty.academicYear;
  setSemesterOptions(facultyYear);
  monthlyRecords = window.SaarthiDemo.readMonthlyRecords();
  const demoFaculty = facultyEmail;
  $("#faculty-profile-name").textContent = demoFaculty;
  $("#faculty-profile-role").textContent = `Year ${facultyYear} faculty · Demo`;
  $("#faculty-year-indicator").textContent = `YEAR ${facultyYear}`;
  $("#faculty-year-indicator").setAttribute("aria-label", `Assigned to academic year ${facultyYear}`);
  const f1 = trainModel();
  allStudents = makeDemoStudents();
  updateActiveSemester();
  const date = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  $("#today-date").textContent = date;
  renderAll();
  setupScrollReveals();
  $("#trend-metric").addEventListener("change", drawTrend);
  $("#overview-search").addEventListener("input", applyTableFilters);
  $("#overview-risk-filter").addEventListener("change", applyTableFilters);
  $("#student-search").addEventListener("input", applyTableFilters);
  $("#student-risk-filter").addEventListener("change", applyTableFilters);
  $("#department-filter").addEventListener("change", applyTableFilters);
  $("#sim-student").addEventListener("change", updateSimulation);
  $("#monthly-student").addEventListener("change", () => {
    renderMonthlyEmails();
    const student = students.find(item => item.id === $("#monthly-student").value);
    $("#monthly-student-recipient").textContent = student
      ? `${student.name} (${student.id}) · email not configured`
      : "Student · email not configured";
  });
  $("#sim-email").addEventListener("click", () => selectedStudentId ? openStudent(selectedStudentId) : showToast("Upload or select a student first."));
  $$(".nav-button[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));
  $("#student-table").addEventListener("click", event => {
    const row = event.target.closest("[data-student-id]");
    if (row) openStudent(row.dataset.studentId);
  });
  $("#student-table").addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      const row = event.target.closest("[data-student-id]");
      if (row) { event.preventDefault(); openStudent(row.dataset.studentId); }
    }
  });
  $("#student-grid").addEventListener("click", event => {
    const card = event.target.closest("[data-student-id]");
    if (card && !card.hidden) openStudent(card.dataset.studentId);
  });
  $("#student-grid").addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      const card = event.target.closest("[data-student-id]");
      if (card && !card.hidden) { event.preventDefault(); openStudent(card.dataset.studentId); }
    }
  });
  $("#priority-list").addEventListener("click", event => {
    const button = event.target.closest("[data-open-student]");
    if (button) openStudent(button.dataset.openStudent);
  });
  $("#download-csv").addEventListener("click", () => downloadCsv(students, "bbit-cohort.csv"));
  $("#download-template").addEventListener("click", downloadMonthlyTemplate);
  $("#csv-file").addEventListener("change", event => {
    const file = event.target.files[0];
    event.target.value = "";
    handleFile(file);
  });
  $("#faculty-portal-toggle").addEventListener("click", toggleStudentPortal);
  $("#portal-roster-file").addEventListener("change", event => {
    const file = event.target.files[0];
    event.target.value = "";
    uploadPortalRoster(file);
  });
  $("#download-roster-template").addEventListener("click", downloadRosterTemplate);
  $("#faculty-sign-out").addEventListener("click", () => {
    sessionStorage.removeItem("saarthiDemoFaculty");
    window.location.href = "faculty/index.html";
  });
  const zone = $("#upload-zone");
  ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
  zone.addEventListener("drop", event => handleFile(event.dataTransfer.files[0]));
  $("#close-modal").addEventListener("click", () => $("#student-modal").classList.remove("open"));
  $("#student-modal").addEventListener("click", event => { if (event.target === $("#student-modal")) $("#student-modal").classList.remove("open"); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") $("#student-modal").classList.remove("open"); });
  window.addEventListener("resize", () => { drawTrend(); if ($("#student-modal").classList.contains("open")) { const student = students.find(item => item.id === $("#student-modal").dataset.studentId); if (student) drawStudentWeeks(student.weeks); } });
  $("#model-validation").textContent = `${Math.round(f1 * 100)}%`;
  $("#term-select").addEventListener("change", event => {
    selectedSemester = Number(event.target.value);
    updateActiveSemester();
    renderAll();
  });
  $("#month-select").addEventListener("change", event => {
    selectedMonth = event.target.value;
    updateActiveSemester();
    renderAll();
  });
  loadPortalSettings();
  window.addEventListener("storage", event => {
    if (event.key === "saarthiDemoPortalEnabled" || event.key === "saarthiDemoPortalEnabled:updatedAt") {
      loadPortalSettings();
    }
  });
}
function updateActiveSemester() {
  students = selectedMonth === "overview"
    ? allStudents.filter(student =>
      student.academic_year === facultyYear && student.semester === selectedSemester
    )
    : monthlyRecords.filter(record =>
      record.academic_year === facultyYear
      && record.semester === selectedSemester
      && record.month_in_semester === Number(selectedMonth)
    );
  $("#term-label").textContent = reportingPeriodLabel();
  $("#faculty-year-indicator").textContent = `YEAR ${facultyYear}`;
}
initialize();
