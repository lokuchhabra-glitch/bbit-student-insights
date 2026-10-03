'use strict';

const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const scrypt = promisify(crypto.scrypt);
const tokenLifetime = 8 * 60 * 60;
const studentTokenLifetime = 15 * 60;
const studentLoginWindowMs = 15 * 60 * 1000;
const studentLoginMaxAttempts = 8;
const requestLimits = new Map();
const allowedOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed.'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'The request body must be a JSON object.' });
    return;
  }
  next();
});
app.use(express.static(path.resolve(__dirname, '../Fronted'), {
  dotfiles: 'deny',
  index: false
}));

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, enum: ['Faculty'], default: 'Faculty' },
  department: { type: String, default: 'General' },
  otpHash: { type: String },
  otpExpiry: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  lastLogin: { type: Date }
}, { timestamps: true });

const studentSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  dateOfBirthSalt: { type: String, required: true },
  dateOfBirthHash: { type: String, required: true, select: false },
  attendance_pct: { type: Number, required: true, min: 0, max: 100 },
  midterm_score: { type: Number, required: true, min: 0, max: 100 },
  assignment_delay_days: { type: Number, required: true, min: 0 },
  lab_viva_score: { type: Number, required: true, min: 0, max: 100 },
  tutorial_sessions: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

const portalSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'student-portal' },
  enabled: { type: Boolean, default: false },
  enabledAt: { type: Date, default: null },
  updatedBy: { type: String, default: null }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
const PortalSettings = mongoose.models.PortalSettings || mongoose.model('PortalSettings', portalSettingsSchema);

function facultyAllowlist() {
  return new Set((process.env.FACULTY_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean));
}

function hasRequiredSecrets() {
  return typeof process.env.AUTH_TOKEN_SECRET === 'string'
    && process.env.AUTH_TOKEN_SECRET.length >= 32
    && typeof process.env.DOB_HASH_SECRET === 'string'
    && process.env.DOB_HASH_SECRET.length >= 32;
}

function databaseReady() {
  return mongoose.connection.readyState === 1;
}

function requireDatabase(req, res, next) {
  if (!databaseReady()) {
    res.status(503).json({ error: 'Student services are temporarily unavailable.' });
    return;
  }
  next();
}

function limited(key, limit, windowMs) {
  const now = Date.now();
  const current = requestLimits.get(key);
  if (!current || current.resetAt <= now) {
    requestLimits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (current.count >= limit) return true;
  current.count++;
  return false;
}

function requestIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function requireConfiguration(req, res, next) {
  if (!hasRequiredSecrets()) {
    res.status(503).json({ error: 'Authentication is not configured on this server.' });
    return;
  }
  next();
}

function otpDigest(email, code) {
  return crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET)
    .update(`${email}:${code}`)
    .digest('hex');
}

function safeEqualHex(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string'
      || !/^[\da-f]{64}$/i.test(first) || !/^[\da-f]{64}$/i.test(second)) return false;
  return crypto.timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}

function createAccessToken(subject, role, expiresInSeconds, extraClaims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: String(subject),
    role,
    iat: now,
    exp: now + expiresInSeconds,
    ...extraClaims
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function readAccessToken(token) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', process.env.AUTH_TOKEN_SECRET)
    .update(payload)
    .digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length
      || !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
  } catch {
    return null;
  }
}

function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const claims = match && readAccessToken(match[1]);
  if (!claims || !['Faculty', 'Student'].includes(claims.role)) {
    res.status(401).json({ error: 'Your session is missing or has expired. Please sign in again.' });
    return;
  }
  if (claims.role === 'Faculty'
      && !facultyAllowlist().has(String(claims.email || '').toLowerCase())) {
    res.status(401).json({ error: 'This faculty account is no longer authorized.' });
    return;
  }
  req.auth = claims;
  next();
}

function requireFaculty(req, res, next) {
  if (req.auth.role !== 'Faculty') {
    res.status(403).json({ error: 'Faculty access is required.' });
    return;
  }
  next();
}

function requireStudent(req, res, next) {
  if (req.auth.role !== 'Student') {
    res.status(403).json({ error: 'Student access is required.' });
    return;
  }
  next();
}

async function currentPortalSettings() {
  return PortalSettings.findByIdAndUpdate(
    'student-portal',
    { $setOnInsert: { enabled: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function requireOpenPortal(req, res, next) {
  try {
    const settings = await currentPortalSettings();
    if (!settings.enabled) {
      res.status(403).json({ error: 'The student portal is currently closed. Please check with your faculty.' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

function validRollNumber(value) {
  return typeof value === 'string' && /^27600125001\d{0,9}$/.test(value.trim());
}

function validDateOfBirth(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return !Number.isNaN(parsed.valueOf())
    && parsed.toISOString().slice(0, 10) === value
    && parsed < today;
}

async function hashDateOfBirth(dateOfBirth, salt) {
  return scrypt(`${dateOfBirth}:${process.env.DOB_HASH_SECRET}`, salt, 64, {
    N: 1 << 14,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
}

function validateRosterRecord(record, index) {
  if (!record || !validRollNumber(record.student_id)) {
    throw new Error(`Row ${index + 1}: student_id must start with 27600125001 and contain up to 20 digits.`);
  }
  if (typeof record.student_name !== 'string' || !record.student_name.trim() || record.student_name.trim().length > 120) {
    throw new Error(`Row ${index + 1}: student_name is required (maximum 120 characters).`);
  }
  if (!validDateOfBirth(record.date_of_birth)) {
    throw new Error(`Row ${index + 1}: date_of_birth must be a valid past date in YYYY-MM-DD format.`);
  }
  const numericFields = ['attendance_pct', 'midterm_score', 'assignment_delay_days', 'lab_viva_score'];
  const values = {};
  for (const field of numericFields) {
    const rawValue = record[field];
    if (rawValue === undefined || rawValue === null
        || !['number', 'string'].includes(typeof rawValue)
        || (typeof rawValue === 'string' && rawValue.trim() === '')) {
      throw new Error(`Row ${index + 1}: ${field} is required.`);
    }
    const value = Number(rawValue);
    const maximum = field === 'assignment_delay_days' ? Number.POSITIVE_INFINITY : 100;
    if (!Number.isFinite(value) || value < 0 || value > maximum) {
      throw new Error(`Row ${index + 1}: ${field} must be a valid non-negative number${maximum === 100 ? ' no greater than 100' : ''}.`);
    }
    values[field] = value;
  }
  const tutorialSessions = record.tutorial_sessions === '' || record.tutorial_sessions === undefined
    ? 0 : Number(record.tutorial_sessions);
  if (!Number.isFinite(tutorialSessions) || tutorialSessions < 0 || tutorialSessions > 100) {
    throw new Error(`Row ${index + 1}: tutorial_sessions must be between 0 and 100.`);
  }
  return {
    rollNumber: record.student_id.trim(),
    name: record.student_name.trim(),
    department: typeof record.department === 'string' && record.department.trim()
      ? record.department.trim().slice(0, 120) : 'Unspecified',
    dateOfBirth: record.date_of_birth,
    tutorial_sessions: tutorialSessions,
    ...values
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: databaseReady() ? 'connected' : 'unavailable' });
});

app.post('/api/auth/send-code', requireConfiguration, (req, res, next) => {
  if (limited(`faculty-send:${requestIp(req)}`, 5, 15 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many verification requests. Try again later.' });
    return;
  }
  next();
}, requireDatabase, async (req, res, next) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !facultyAllowlist().has(email)) {
    res.status(403).json({ error: 'This email is not authorized for faculty access.' });
    return;
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    res.status(503).json({ error: 'Faculty email verification is not configured.' });
    return;
  }
  try {
    const code = crypto.randomInt(100000, 1000000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const otpHash = otpDigest(email, code);
    await User.findOneAndUpdate(
      { email },
      { $set: { otpHash, otpExpiry, otpAttempts: 0 }, $setOnInsert: { role: 'Faculty' } },
      { upsert: true, new: true, runValidators: true }
    );
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    await transporter.sendMail({
      from: `"BBIT Faculty Portal" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your BBIT verification code',
      text: `Your faculty verification code is ${code}. It expires in 10 minutes.`
    });
    res.json({ message: 'Verification code sent to your institutional email.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/verify-code', requireConfiguration, requireDatabase, async (req, res, next) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Enter a valid email and six-digit verification code.' });
    return;
  }
  if (!facultyAllowlist().has(email)) {
    res.status(403).json({ error: 'This email is not authorized for faculty access.' });
    return;
  }
  try {
    const user = await User.findOne({ email });
    const now = new Date();
    if (!user || !user.otpHash || !user.otpExpiry || user.otpExpiry <= now
        || user.otpAttempts >= 5 || !safeEqualHex(otpDigest(email, code), user.otpHash)) {
      if (user && user.otpExpiry > now && user.otpAttempts < 5) {
        user.otpAttempts++;
        await user.save();
      }
      res.status(401).json({ error: 'The verification code is invalid or expired.' });
      return;
    }
    user.otpHash = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
    user.lastLogin = now;
    await user.save();
    const token = createAccessToken(user._id, 'Faculty', tokenLifetime, { email: user.email });
    res.json({
      token,
      expiresIn: tokenLifetime,
      user: { id: user._id, email: user.email, role: user.role, department: user.department }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireConfiguration, authenticate, requireFaculty, requireDatabase, async (req, res, next) => {
  try {
    const user = await User.findById(req.auth.sub).select('email role department');
    if (!user) {
      res.status(401).json({ error: 'Faculty account is no longer available.' });
      return;
    }
    res.json({ id: user._id, email: user.email, role: user.role, department: user.department });
  } catch (error) {
    next(error);
  }
});

app.get('/api/student-portal/status', requireDatabase, async (req, res, next) => {
  try {
    const settings = await currentPortalSettings();
    res.set('Cache-Control', 'no-store');
    res.json({ enabled: settings.enabled, enabledAt: settings.enabledAt });
  } catch (error) {
    next(error);
  }
});

app.get('/api/faculty/student-portal', requireConfiguration, authenticate, requireFaculty, requireDatabase, async (req, res, next) => {
  try {
    const settings = await currentPortalSettings();
    res.set('Cache-Control', 'no-store');
    res.json({ enabled: settings.enabled, enabledAt: settings.enabledAt });
  } catch (error) {
    next(error);
  }
});

app.put('/api/faculty/student-portal', requireConfiguration, authenticate, requireFaculty, requireDatabase, async (req, res, next) => {
  if (typeof req.body.enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled must be true or false.' });
    return;
  }
  try {
    const settings = await PortalSettings.findByIdAndUpdate(
      'student-portal',
      {
        $set: {
          enabled: req.body.enabled,
          enabledAt: req.body.enabled ? new Date() : null,
          updatedBy: req.auth.email
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.set('Cache-Control', 'no-store');
    res.json({ enabled: settings.enabled, enabledAt: settings.enabledAt });
  } catch (error) {
    next(error);
  }
});

app.post('/api/faculty/students/import', requireConfiguration, authenticate, requireFaculty, requireDatabase, async (req, res, next) => {
  const records = req.body.students;
  if (!Array.isArray(records) || records.length === 0 || records.length > 500) {
    res.status(400).json({ error: 'Upload between 1 and 500 student records at a time.' });
    return;
  }
  try {
    const validated = records.map((record, index) => validateRosterRecord(record, index));
    const rollNumbers = validated.map(student => student.rollNumber);
    if (new Set(rollNumbers).size !== rollNumbers.length) {
      res.status(400).json({ error: 'The upload contains duplicate student roll numbers.' });
      return;
    }
    const prepared = await Promise.all(validated.map(async student => {
      const salt = crypto.randomBytes(16);
      const digest = await hashDateOfBirth(student.dateOfBirth, salt);
      return {
        ...student,
        dateOfBirthSalt: salt.toString('hex'),
        dateOfBirthHash: digest.toString('hex')
      };
    }));
    const operations = prepared.map(({ dateOfBirth, ...student }) => ({
      updateOne: {
        filter: { rollNumber: student.rollNumber },
        update: { $set: student },
        upsert: true
      }
    }));
    const result = await Student.bulkWrite(operations, { ordered: true });
    res.json({
      received: records.length,
      created: result.upsertedCount,
      updated: result.modifiedCount,
      message: 'Student roster saved. Date of birth is stored as a salted hash.'
    });
  } catch (error) {
    if (error instanceof Error && /^Row \d+:/.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.post('/api/student-portal/login', requireConfiguration, requireDatabase, async (req, res, next) => {
  const ipKey = `student-login:${requestIp(req)}`;
  if (limited(ipKey, studentLoginMaxAttempts, studentLoginWindowMs)) {
    res.status(429).json({ error: 'Too many sign-in attempts. Wait 15 minutes and try again.' });
    return;
  }
  const rollNumber = typeof req.body.rollNumber === 'string' ? req.body.rollNumber.trim() : '';
  const dateOfBirth = typeof req.body.dateOfBirth === 'string' ? req.body.dateOfBirth : '';
  if (!validRollNumber(rollNumber) || !validDateOfBirth(dateOfBirth)) {
    res.status(400).json({ error: 'Enter your college roll number and date of birth.' });
    return;
  }
  try {
    const settings = await currentPortalSettings();
    if (!settings.enabled) {
      res.status(403).json({ error: 'The student portal is currently closed. Please check with your faculty.' });
      return;
    }
    const student = await Student.findOne({ rollNumber }).select('+dateOfBirthHash');
    if (!student) {
      const dummySalt = crypto.createHmac('sha256', process.env.DOB_HASH_SECRET)
        .update('student-login-dummy-salt')
        .digest()
        .subarray(0, 16);
      const dummyHash = await hashDateOfBirth(dateOfBirth, dummySalt);
      crypto.timingSafeEqual(dummyHash, Buffer.alloc(dummyHash.length));
      res.status(401).json({ error: 'Roll number or date of birth is incorrect.' });
      return;
    }
    const suppliedHash = await hashDateOfBirth(dateOfBirth, Buffer.from(student.dateOfBirthSalt, 'hex'));
    const storedHash = Buffer.from(student.dateOfBirthHash, 'hex');
    if (suppliedHash.length !== storedHash.length || !crypto.timingSafeEqual(suppliedHash, storedHash)) {
      res.status(401).json({ error: 'Roll number or date of birth is incorrect.' });
      return;
    }
    const token = createAccessToken(student._id, 'Student', studentTokenLifetime);
    res.set('Cache-Control', 'no-store');
    res.json({ token, expiresIn: studentTokenLifetime });
  } catch (error) {
    next(error);
  }
});

app.get('/api/student/me', requireConfiguration, authenticate, requireStudent, requireDatabase, requireOpenPortal, async (req, res, next) => {
  try {
    const student = await Student.findById(req.auth.sub).select(
      'rollNumber name department attendance_pct midterm_score assignment_delay_days lab_viva_score tutorial_sessions'
    );
    if (!student) {
      res.status(401).json({ error: 'Student record is no longer available. Please contact your faculty.' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({
      rollNumber: student.rollNumber,
      name: student.name,
      department: student.department,
      attendance_pct: student.attendance_pct,
      midterm_score: student.midterm_score,
      assignment_delay_days: student.assignment_delay_days,
      lab_viva_score: student.lab_viva_score,
      tutorial_sessions: student.tutorial_sessions,
      updatedAt: student.updatedAt
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/student/logout', authenticate, requireStudent, (req, res) => {
  res.status(200).json({ message: 'Signed out. Close the page to clear this session.' });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error.message === 'Origin is not allowed.') {
    res.status(403).json({ error: 'This site is not allowed to access the API.' });
    return;
  }
  if (error.type === 'entity.too.large') {
    res.status(413).json({ error: 'The request body exceeds the 1 MB limit.' });
    return;
  }
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request contains malformed JSON.' });
    return;
  }
  console.error('Request failed:', error.name || 'Error');
  res.status(500).json({ error: 'The request could not be completed.' });
});

if (require.main === module) {
  const missingConfig = [];
  if (!process.env.MONGODB_URI) missingConfig.push('MONGODB_URI');
  if (!hasRequiredSecrets()) missingConfig.push('AUTH_TOKEN_SECRET and DOB_HASH_SECRET (at least 32 characters each)');
  if (facultyAllowlist().size === 0) missingConfig.push('FACULTY_EMAILS');
  if (missingConfig.length) {
    console.error(`Cannot start BBIT backend. Configure: ${missingConfig.join(', ')}.`);
    process.exitCode = 1;
  } else {
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => app.listen(PORT, '0.0.0.0', () => {
        console.log(`BBIT backend listening on port ${PORT}.`);
      }))
      .catch(() => {
        console.error('MongoDB connection failed. Check MONGODB_URI and database availability.');
        process.exitCode = 1;
      });
  }
}

module.exports = { app, hashDateOfBirth, validDateOfBirth, validRollNumber };
