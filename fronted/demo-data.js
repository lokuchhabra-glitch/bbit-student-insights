"use strict";

(() => {
  const PORTAL_KEY = "saarthiDemoPortalEnabled";
  const PORTAL_UPDATED_KEY = `${PORTAL_KEY}:updatedAt`;
  const ROSTER_KEY = "saarthiDemoRoster";
  const MONTHLY_RECORDS_KEY = "saarthiDemoMonthlyRecords";
  let photoDatabase;
  const facultyAccounts = Object.freeze([
    { email: "year1@bbit.edu", academicYear: 1 },
    { email: "year2@bbit.edu", academicYear: 2 },
    { email: "year3@bbit.edu", academicYear: 3 },
    { email: "year4@bbit.edu", academicYear: 4 }
  ]);
  const sampleStudents = [
    { student_name: "Aarav Sharma", student_id: "27600125001", date_of_birth: "2005-01-15", department: "Computer Science", academic_year: 1, semester: 1, attendance_pct: 82, midterm_score: 74, assignment_delay_days: 1.5, lab_viva_score: 78, tutorial_sessions: 2 },
    { student_name: "Diya Patel", student_id: "27600125001001", date_of_birth: "2005-06-22", department: "Computer Science", academic_year: 1, semester: 2, attendance_pct: 68, midterm_score: 59, assignment_delay_days: 4, lab_viva_score: 63, tutorial_sessions: 1 },
    { student_name: "Rohan Das", student_id: "27600125001002", date_of_birth: "2004-11-08", department: "Electronics", academic_year: 1, semester: 1, attendance_pct: 93, midterm_score: 87, assignment_delay_days: 0, lab_viva_score: 91, tutorial_sessions: 3 }
  ];

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function readRoster() {
    const saved = safeGet(ROSTER_KEY);
    let imported = [];
    if (saved) {
      try {
        imported = JSON.parse(saved);
        if (!Array.isArray(imported)) imported = [];
      } catch {
        imported = [];
      }
    }
    const records = new Map(sampleStudents.map(student => [student.student_id, student]));
    imported.forEach(student => {
      if (student && typeof student.student_id === "string") {
        const academicYear = Number(student.academic_year);
        const semester = Number(student.semester);
        const normalizedStudent = { ...student };
        if (academicYear > 1 && academicYear <= 4 && [1, 2].includes(semester)) {
          normalizedStudent.semester = (academicYear - 1) * 2 + semester;
        }
        records.set(student.student_id, normalizedStudent);
      }
    });
    return [...records.values()];
  }

  function readMonthlyRecords() {
    const saved = safeGet(MONTHLY_RECORDS_KEY);
    if (!saved) return [];
    try {
      const records = JSON.parse(saved);
      return Array.isArray(records) ? records : [];
    } catch {
      return [];
    }
  }

  function openPhotoDatabase() {
    if (photoDatabase) return photoDatabase;
    photoDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open("bbitStudentPhotos", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "studentId" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        photoDatabase = null;
        reject(request.error || new Error("Could not open browser photo storage."));
      };
    });
    return photoDatabase;
  }

  function readStudentPhoto(studentId) {
    return openPhotoDatabase().then(database => new Promise((resolve, reject) => {
      const request = database.transaction("photos", "readonly").objectStore("photos").get(studentId);
      request.onsuccess = () => resolve(request.result?.photo || null);
      request.onerror = () => reject(request.error || new Error("Could not load this student photo."));
    }));
  }

  function writeStudentPhoto(studentId, photo) {
    return openPhotoDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction("photos", "readwrite");
      transaction.objectStore("photos").put({ studentId, photo });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save this student photo."));
      transaction.onabort = () => reject(transaction.error || new Error("Photo saving was cancelled by browser storage."));
    }));
  }

  function removeStudentPhoto(studentId) {
    return openPhotoDatabase().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction("photos", "readwrite");
      transaction.objectStore("photos").delete(studentId);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not remove this student photo."));
      transaction.onabort = () => reject(transaction.error || new Error("Photo removal was cancelled by browser storage."));
    }));
  }

  async function createPassportPhoto(file) {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file for the student photo.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
    const image = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 400;
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
    const cropWidth = canvas.width / scale;
    const cropHeight = canvas.height / scale;
    const context = canvas.getContext("2d");
    if (!context) {
      image.close();
      throw new Error("Could not prepare the photo in this browser.");
    }
    context.drawImage(
      image,
      (image.width - cropWidth) / 2,
      (image.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
    image.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Could not prepare this image as a passport-size photo."));
      }, "image/jpeg", .84);
    });
  }

  window.SaarthiDemo = Object.freeze({
    sampleStudents,
    facultyAccounts,
    getFacultyAccount(email) {
      return facultyAccounts.find(account => account.email === String(email || "").trim().toLowerCase()) || null;
    },
    readRoster,
    readMonthlyRecords,
    writeMonthlyRecords(records) {
      try {
        localStorage.setItem(MONTHLY_RECORDS_KEY, JSON.stringify(records));
        return true;
      } catch {
        return false;
      }
    },
    readStudentPhoto,
    writeStudentPhoto,
    removeStudentPhoto,
    createPassportPhoto,
    readPortalEnabled: () => safeGet(PORTAL_KEY) === "true",
    readPortalUpdatedAt: () => safeGet(PORTAL_UPDATED_KEY),
    writePortal(enabled) {
      try {
        localStorage.setItem(PORTAL_KEY, String(enabled));
        localStorage.setItem(PORTAL_UPDATED_KEY, enabled ? new Date().toISOString() : "");
        return true;
      } catch {
        return false;
      }
    },
    writeRoster(records) {
      try {
        localStorage.setItem(ROSTER_KEY, JSON.stringify(records));
        return true;
      } catch {
        return false;
      }
    }
  });
})();
