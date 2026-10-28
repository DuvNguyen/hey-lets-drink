const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL ? '/tmp/hey-lets-drink-data' : path.join(__dirname, 'data');
const MEDS_FILE = path.join(DATA_DIR, 'medications.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ESCALATION_FILE = path.join(DATA_DIR, 'escalation.json');
const PINS_FILE = path.join(DATA_DIR, 'pins.json');
const NOTES_FILE = path.join(DATA_DIR, 'shared_notes.json');

const defaultPins = {
  girlfriendPin: '9230',
  adminPin: '7777'
};

const defaultSettings = {
  sound: 'chime',
  density: 'double',
  vibration: 'standard',
  advanceNotice: 0
};

const defaultEscalation = {
  enabled: true,
  startInterval: 10,
  maxDuration: 50,
  customNudgeText: 'Nhắc nhở: Đến cữ uống thuốc, vui lòng kiểm tra và xác nhận.',
  stage1Message: 'Đã quá giờ 10 phút. Vui lòng uống thuốc và xác nhận.',
  stage2Message: 'Đã quá giờ 15 phút. Vui lòng uống thuốc.',
  stage3Message: 'Đã quá giờ 17 phút. Nhắc nhở uống thuốc lần 4.',
  stage4Message: 'Khẩn cấp: Cữ thuốc đã quá hạn. Vui lòng uống thuốc ngay.'
};

const defaultMeds = [];

// Clean connection string (strip accidental quotes from env input)
const rawDbUrl = (process.env.DATABASE_URL || '').replace(/^["']|["']$/g, '').trim();

// Initialize Neon SQL client if DATABASE_URL is provided
let sql = null;
if (rawDbUrl) {
  try {
    sql = neon(rawDbUrl);
  } catch (err) {
    console.error('Failed to initialize Neon SQL client:', err.message);
  }
}

// Lazy-load Neon Realtime via dynamic import to maintain full CJS/ESM compatibility across runtimes
let realtimeInstance = null;
let realtimeModulePromise = null;

async function getRealtime() {
  if (realtimeInstance) return realtimeInstance;
  const secret = (process.env.NEON_REALTIME_SECRET || '').replace(/^["']|["']$/g, '').trim();
  if (!secret) return null;
  if (!realtimeModulePromise) {
    realtimeModulePromise = import('@neon/realtime/server').then(({ createRealtime, rawSql }) => {
      realtimeInstance = {
        client: createRealtime({ secret, db: 'neondb' }),
        rawSql
      };
      return realtimeInstance;
    }).catch(err => {
      console.error('Failed to dynamically load @neon/realtime/server:', err.message);
      return null;
    });
  }
  return realtimeModulePromise;
}

// Local JSON fallback helpers
function readJSON(file, defaultValue) {
  try {
    if (!fs.existsSync(file)) return defaultValue;
    const content = fs.readFileSync(file, 'utf8');
    return JSON.parse(content || '[]');
  } catch {
    return defaultValue;
  }
}

function writeJSON(file, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${file}:`, err.message);
  }
}

// Ensure database tables exist and seed initial data
let isDbInitialized = false;
async function initDb() {
  if (!sql) return;
  if (isDbInitialized) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS medications (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dosage TEXT,
        time TEXT NOT NULL,
        frequency TEXT DEFAULT 'daily',
        days_of_week JSONB DEFAULT '[]'::jsonb,
        day_of_month INT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        medication_id TEXT NOT NULL,
        medication_name TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        taken_at TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
        endpoint TEXT PRIMARY KEY,
        keys JSONB NOT NULL,
        subscribed_at TIMESTAMPTZ DEFAULT NOW(),
        device_info TEXT,
        enabled BOOLEAN DEFAULT true
      );
    `;

    // Ensure 'enabled' and 'role' columns exist in subscriptions
    await sql`
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;
    `;
    await sql`
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'girlfriend';
    `;

    // Ensure 'note' column exists in logs
    await sql`
      ALTER TABLE logs ADD COLUMN IF NOT EXISTS note TEXT;
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS shared_notes (
        id TEXT PRIMARY KEY,
        author_role TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        read_by_other_at TIMESTAMPTZ
      );
    `;

    await sql`
      ALTER TABLE shared_notes ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
    `;
    await sql`
      ALTER TABLE shared_notes ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_shared_notes_created_at ON shared_notes (created_at DESC);
    `;

    // Seed medications if table is empty
    const existingMeds = await sql`SELECT COUNT(*)::int as count FROM medications`;
    if (existingMeds[0]?.count === 0) {
      for (const m of defaultMeds) {
        await sql`
          INSERT INTO medications (id, name, dosage, time, frequency, days_of_week, day_of_month, active)
          VALUES (${m.id}, ${m.name}, ${m.dosage}, ${m.time}, ${m.frequency || 'daily'}, ${JSON.stringify(m.daysOfWeek || [])}::jsonb, ${m.dayOfMonth || null}, ${m.active})
          ON CONFLICT (id) DO NOTHING;
        `;
      }
    }

    // Seed settings if empty
    const existingSettings = await sql`SELECT value FROM app_settings WHERE key = 'settings'`;
    if (existingSettings.length === 0) {
      await sql`
        INSERT INTO app_settings (key, value)
        VALUES ('settings', ${JSON.stringify(defaultSettings)}::jsonb)
        ON CONFLICT (key) DO NOTHING;
      `;
    }

    // Seed escalation if empty
    const existingEscalation = await sql`SELECT value FROM app_settings WHERE key = 'escalation'`;
    if (existingEscalation.length === 0) {
      await sql`
        INSERT INTO app_settings (key, value)
        VALUES ('escalation', ${JSON.stringify(defaultEscalation)}::jsonb)
        ON CONFLICT (key) DO NOTHING;
      `;
    }

    // Seed auth pins if empty
    const existingPins = await sql`SELECT value FROM app_settings WHERE key = 'auth_pins'`;
    if (existingPins.length === 0) {
      await sql`
        INSERT INTO app_settings (key, value)
        VALUES ('auth_pins', ${JSON.stringify(defaultPins)}::jsonb)
        ON CONFLICT (key) DO NOTHING;
      `;
    }

    isDbInitialized = true;
    console.log('✓ Connected to Neon Lakebase Postgres (Tables verified & seeded)');
  } catch (err) {
    console.error('Error initializing Neon DB schema:', err);
  }
}

// ----------------- Data Access Methods -----------------

// Medications
async function getMedications() {
  if (sql) {
    await initDb();
    const rows = await sql`SELECT * FROM medications ORDER BY time ASC`;
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      dosage: r.dosage,
      time: r.time,
      frequency: r.frequency,
      daysOfWeek: r.days_of_week || [],
      dayOfMonth: r.day_of_month,
      active: r.active
    }));
  }
  return readJSON(MEDS_FILE, defaultMeds);
}

async function addMedication(med) {
  if (sql) {
    await initDb();
    await sql`
      INSERT INTO medications (id, name, dosage, time, frequency, days_of_week, day_of_month, active)
      VALUES (
        ${med.id},
        ${med.name},
        ${med.dosage || ''},
        ${med.time},
        ${med.frequency || 'daily'},
        ${JSON.stringify(med.daysOfWeek || [])}::jsonb,
        ${med.dayOfMonth || null},
        ${med.active !== false}
      );
    `;
    return med;
  }
  const meds = readJSON(MEDS_FILE, defaultMeds);
  meds.push(med);
  writeJSON(MEDS_FILE, meds);
  return med;
}

async function updateMedication(id, updates) {
  if (sql) {
    await initDb();
    const existing = await sql`SELECT * FROM medications WHERE id = ${id}`;
    if (!existing.length) return null;
    const current = existing[0];
    const updated = {
      name: updates.name !== undefined ? updates.name : current.name,
      dosage: updates.dosage !== undefined ? updates.dosage : current.dosage,
      time: updates.time !== undefined ? updates.time : current.time,
      frequency: updates.frequency !== undefined ? updates.frequency : current.frequency,
      days_of_week: updates.daysOfWeek !== undefined ? JSON.stringify(updates.daysOfWeek) : JSON.stringify(current.days_of_week || []),
      day_of_month: updates.dayOfMonth !== undefined ? updates.dayOfMonth : current.day_of_month,
      active: updates.active !== undefined ? updates.active : current.active
    };
    await sql`
      UPDATE medications
      SET name = ${updated.name},
          dosage = ${updated.dosage},
          time = ${updated.time},
          frequency = ${updated.frequency},
          days_of_week = ${updated.days_of_week}::jsonb,
          day_of_month = ${updated.day_of_month},
          active = ${updated.active}
      WHERE id = ${id}
    `;
    return { id, ...updates };
  }
  const meds = readJSON(MEDS_FILE, defaultMeds);
  const idx = meds.findIndex(m => m.id === id);
  if (idx === -1) return null;
  meds[idx] = { ...meds[idx], ...updates };
  writeJSON(MEDS_FILE, meds);
  return meds[idx];
}

async function deleteMedication(id) {
  if (sql) {
    await initDb();
    await sql`DELETE FROM medications WHERE id = ${id}`;
    await sql`DELETE FROM logs WHERE medication_id = ${id}`;
    return true;
  }
  let meds = readJSON(MEDS_FILE, defaultMeds);
  meds = meds.filter(m => m.id !== id);
  writeJSON(MEDS_FILE, meds);
  return true;
}

// Logs
async function getLogs() {
  if (sql) {
    await initDb();
    const rows = await sql`SELECT * FROM logs ORDER BY created_at DESC LIMIT 500`;
    return rows.map(r => ({
      id: r.id,
      medicationId: r.medication_id,
      medicationName: r.medication_name,
      date: r.date,
      status: r.status,
      takenAt: r.taken_at,
      note: r.note || null
    }));
  }
  return readJSON(LOGS_FILE, []);
}

async function addLog(logEntry) {
  if (sql) {
    await initDb();
    await sql`
      INSERT INTO logs (medication_id, medication_name, date, status, taken_at, note)
      VALUES (${logEntry.medicationId}, ${logEntry.medicationName}, ${logEntry.date}, ${logEntry.status}, ${logEntry.takenAt}, ${logEntry.note || null});
    `;
    return logEntry;
  }
  const logs = readJSON(LOGS_FILE, []);
  logs.push(logEntry);
  writeJSON(LOGS_FILE, logs);
  return logEntry;
}

// Subscriptions
async function getSubscriptions() {
  if (sql) {
    await initDb();
    const rows = await sql`SELECT * FROM subscriptions ORDER BY subscribed_at DESC`;
    return rows.map(r => ({
      endpoint: r.endpoint,
      keys: r.keys,
      subscribedAt: r.subscribed_at,
      deviceInfo: r.device_info,
      enabled: r.enabled !== false,
      role: r.role || 'girlfriend'
    }));
  }
  const subs = readJSON(SUBS_FILE, []);
  return subs.map(s => ({
    ...s,
    enabled: s.enabled !== false,
    role: s.role || 'girlfriend'
  }));
}

async function addSubscription(sub, deviceInfo = '', role = 'girlfriend') {
  if (!sub || !sub.endpoint) return null;
  if (sql) {
    await initDb();
    await sql`
      INSERT INTO subscriptions (endpoint, keys, device_info, subscribed_at, enabled, role)
      VALUES (${sub.endpoint}, ${JSON.stringify(sub.keys)}::jsonb, ${deviceInfo}, NOW(), true, ${role})
      ON CONFLICT (endpoint) DO UPDATE
      SET keys = ${JSON.stringify(sub.keys)}::jsonb,
          device_info = ${deviceInfo},
          subscribed_at = NOW();
    `;
    return sub;
  }
  const subs = readJSON(SUBS_FILE, []);
  const idx = subs.findIndex(s => s.endpoint === sub.endpoint);
  if (idx >= 0) {
    subs[idx] = { ...subs[idx], keys: sub.keys, deviceInfo, subscribedAt: new Date().toISOString() };
  } else {
    subs.push({ ...sub, deviceInfo, subscribedAt: new Date().toISOString(), enabled: true, role });
  }
  writeJSON(SUBS_FILE, subs);
  return sub;
}

async function updateSubscriptionRole(endpoint, role) {
  if (!endpoint || !role) return false;
  if (sql) {
    await initDb();
    await sql`
      UPDATE subscriptions
      SET role = ${role}
      WHERE endpoint = ${endpoint};
    `;
    return true;
  }
  const subs = readJSON(SUBS_FILE, []);
  const found = subs.find(s => s.endpoint === endpoint);
  if (found) {
    found.role = role;
    writeJSON(SUBS_FILE, subs);
    return true;
  }
  return false;
}

async function updateSubscriptionEnabled(endpoint, enabled) {
  if (!endpoint) return false;
  const isEnabled = enabled !== false;
  if (sql) {
    await initDb();
    await sql`
      UPDATE subscriptions
      SET enabled = ${isEnabled}
      WHERE endpoint = ${endpoint};
    `;
    return true;
  }
  const subs = readJSON(SUBS_FILE, []);
  const found = subs.find(s => s.endpoint === endpoint);
  if (found) {
    found.enabled = isEnabled;
    writeJSON(SUBS_FILE, subs);
    return true;
  }
  return false;
}

async function removeSubscription(endpoint) {
  if (sql) {
    await initDb();
    await sql`DELETE FROM subscriptions WHERE endpoint = ${endpoint}`;
    return true;
  }
  let subs = readJSON(SUBS_FILE, []);
  subs = subs.filter(s => s.endpoint !== endpoint);
  writeJSON(SUBS_FILE, subs);
  return true;
}

// Settings
async function getSettings() {
  if (sql) {
    await initDb();
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'settings'`;
    if (rows.length && rows[0].value) {
      return { ...defaultSettings, ...rows[0].value };
    }
    return defaultSettings;
  }
  return readJSON(SETTINGS_FILE, defaultSettings);
}

async function updateSettings(newSettings) {
  if (sql) {
    await initDb();
    const current = await getSettings();
    const merged = { ...current, ...newSettings };
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('settings', ${JSON.stringify(merged)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = ${JSON.stringify(merged)}::jsonb, updated_at = NOW();
    `;
    return merged;
  }
  const current = readJSON(SETTINGS_FILE, defaultSettings);
  const updated = { ...current, ...newSettings };
  writeJSON(SETTINGS_FILE, updated);
  return updated;
}

// Escalation Config
async function getEscalation() {
  if (sql) {
    await initDb();
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'escalation'`;
    if (rows.length && rows[0].value) {
      return { ...defaultEscalation, ...rows[0].value };
    }
    return defaultEscalation;
  }
  return readJSON(ESCALATION_FILE, defaultEscalation);
}

async function updateEscalation(newEscalation) {
  if (sql) {
    await initDb();
    const current = await getEscalation();
    const merged = { ...current, ...newEscalation };
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('escalation', ${JSON.stringify(merged)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = ${JSON.stringify(merged)}::jsonb, updated_at = NOW();
    `;
    return merged;
  }
  const current = readJSON(ESCALATION_FILE, defaultEscalation);
  const updated = { ...current, ...newEscalation };
  writeJSON(ESCALATION_FILE, updated);
  return updated;
}

// Auth PINs
async function getAuthPins() {
  if (sql) {
    await initDb();
    const rows = await sql`SELECT value FROM app_settings WHERE key = 'auth_pins'`;
    if (rows.length && rows[0].value) {
      return { ...defaultPins, ...rows[0].value };
    }
    return defaultPins;
  }
  return readJSON(PINS_FILE, defaultPins);
}

async function updateAuthPins(newPins) {
  if (sql) {
    await initDb();
    const current = await getAuthPins();
    const merged = { ...current, ...newPins };
    await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('auth_pins', ${JSON.stringify(merged)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = ${JSON.stringify(merged)}::jsonb, updated_at = NOW();
    `;
    return merged;
  }
  const current = readJSON(PINS_FILE, defaultPins);
  const merged = { ...current, ...newPins };
  writeJSON(PINS_FILE, merged);
  return merged;
}

// Shared Notes (Saturday Weekly Reflection / Couple Notes)
async function getSharedNotes() {
  if (sql) {
    await initDb();
    const rows = await sql`
      SELECT 
        id, 
        author_role as "authorRole", 
        author_name as "authorName", 
        content, 
        created_at as "createdAt", 
        read_by_other_at as "readByOtherAt",
        is_edited as "isEdited",
        edited_at as "editedAt"
      FROM shared_notes 
      ORDER BY created_at DESC 
      LIMIT 100;
    `;
    return rows;
  }
  const notes = readJSON(NOTES_FILE, []);
  notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return notes;
}

async function addSharedNote({ id, authorRole, authorName, content }) {
  const noteId = id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const role = authorRole === 'admin' ? 'admin' : 'girlfriend';
  const name = authorName || (role === 'admin' ? 'Vi' : 'Duyen');
  const text = String(content || '').trim();

  if (sql) {
    await initDb();
    const rows = await sql`
      INSERT INTO shared_notes (id, author_role, author_name, content, created_at)
      VALUES (${noteId}, ${role}, ${name}, ${text}, NOW())
      RETURNING 
        id, 
        author_role as "authorRole", 
        author_name as "authorName", 
        content, 
        created_at as "createdAt", 
        read_by_other_at as "readByOtherAt",
        is_edited as "isEdited",
        edited_at as "editedAt";
    `;
    return rows[0];
  }

  const notes = readJSON(NOTES_FILE, []);
  const newNote = {
    id: noteId,
    authorRole: role,
    authorName: name,
    content: text,
    createdAt: new Date().toISOString(),
    readByOtherAt: null,
    isEdited: false,
    editedAt: null
  };
  notes.unshift(newNote);
  writeJSON(NOTES_FILE, notes);
  return newNote;
}

async function updateSharedNote(id, { content, requesterRole }) {
  const text = String(content || '').trim();
  if (!text) throw new Error('Nội dung tin nhắn không được để trống.');

  if (sql) {
    await initDb();
    const rows = await sql`SELECT * FROM shared_notes WHERE id = ${id}`;
    if (!rows.length) throw new Error('Không tìm thấy tin nhắn.');
    const note = rows[0];

    const ageMs = Date.now() - new Date(note.created_at).getTime();
    if (ageMs > 10 * 60 * 1000) {
      throw new Error('Đã quá 10 phút, không thể chỉnh sửa tin nhắn này.');
    }

    if (requesterRole !== 'admin' && note.author_role !== requesterRole) {
      throw new Error('Bạn không có quyền chỉnh sửa tin nhắn này.');
    }

    const updated = await sql`
      UPDATE shared_notes
      SET content = ${text}, is_edited = true, edited_at = NOW()
      WHERE id = ${id}
      RETURNING 
        id, 
        author_role as "authorRole", 
        author_name as "authorName", 
        content, 
        created_at as "createdAt", 
        read_by_other_at as "readByOtherAt",
        is_edited as "isEdited",
        edited_at as "editedAt";
    `;
    return updated[0];
  }

  const notes = readJSON(NOTES_FILE, []);
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) throw new Error('Không tìm thấy tin nhắn.');
  const note = notes[idx];
  const ageMs = Date.now() - new Date(note.createdAt).getTime();
  if (ageMs > 10 * 60 * 1000) {
    throw new Error('Đã quá 10 phút, không thể chỉnh sửa tin nhắn này.');
  }
  if (requesterRole !== 'admin' && note.authorRole !== requesterRole) {
    throw new Error('Bạn không có quyền chỉnh sửa tin nhắn này.');
  }

  note.content = text;
  note.isEdited = true;
  note.editedAt = new Date().toISOString();
  writeJSON(NOTES_FILE, notes);
  return note;
}

async function markNotesAsRead(viewerRole) {
  const role = viewerRole === 'admin' ? 'admin' : 'girlfriend';
  if (sql) {
    await initDb();
    await sql`
      UPDATE shared_notes
      SET read_by_other_at = NOW()
      WHERE author_role != ${role} AND read_by_other_at IS NULL;
    `;
    return { success: true };
  }

  const notes = readJSON(NOTES_FILE, []);
  let updated = false;
  const nowIso = new Date().toISOString();
  notes.forEach(n => {
    if (n.authorRole !== role && !n.readByOtherAt) {
      n.readByOtherAt = nowIso;
      updated = true;
    }
  });
  if (updated) {
    writeJSON(NOTES_FILE, notes);
  }
  return { success: true };
}

async function deleteSharedNote(id, requesterRole) {
  if (sql) {
    await initDb();
    const rows = await sql`SELECT * FROM shared_notes WHERE id = ${id}`;
    if (!rows.length) return { success: true };
    const note = rows[0];

    const ageMs = Date.now() - new Date(note.created_at).getTime();
    if (ageMs > 10 * 60 * 1000 && requesterRole !== 'admin') {
      throw new Error('Đã quá 10 phút, không thể gỡ tin nhắn này.');
    }

    if (requesterRole !== 'admin' && note.author_role !== requesterRole) {
      throw new Error('Bạn không có quyền gỡ tin nhắn này.');
    }

    await sql`DELETE FROM shared_notes WHERE id = ${id}`;
    return { success: true };
  }

  let notes = readJSON(NOTES_FILE, []);
  const note = notes.find(n => n.id === id);
  if (!note) return { success: true };

  const ageMs = Date.now() - new Date(note.createdAt).getTime();
  if (ageMs > 10 * 60 * 1000 && requesterRole !== 'admin') {
    throw new Error('Đã quá 10 phút, không thể gỡ tin nhắn này.');
  }

  if (requesterRole !== 'admin' && note.authorRole !== requesterRole) {
    throw new Error('Bạn không có quyền gỡ tin nhắn này.');
  }

  notes = notes.filter(n => n.id !== id);
  writeJSON(NOTES_FILE, notes);
  return { success: true };
}

// Realtime Sealed Query
async function sealRealtimeQuery(querySql, params = []) {
  const rt = await getRealtime();
  if (!rt || !rt.client) {
    throw new Error('Neon Realtime is not configured (missing NEON_REALTIME_SECRET)');
  }
  return await rt.client.seal({
    query: rt.rawSql(querySql, params)
  });
}

module.exports = {
  initDb,
  getMedications,
  addMedication,
  updateMedication,
  deleteMedication,
  getLogs,
  addLog,
  getSubscriptions,
  addSubscription,
  updateSubscriptionEnabled,
  updateSubscriptionRole,
  removeSubscription,
  getSettings,
  updateSettings,
  getEscalation,
  updateEscalation,
  getAuthPins,
  updateAuthPins,
  getSharedNotes,
  addSharedNote,
  updateSharedNote,
  markNotesAsRead,
  deleteSharedNote,
  sealRealtimeQuery,
  defaultPins,
  defaultMeds,
  defaultSettings,
  defaultEscalation
};
