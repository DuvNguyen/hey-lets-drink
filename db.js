const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL ? '/tmp/hey-lets-drink-data' : path.join(__dirname, 'data');
const MEDS_FILE = path.join(DATA_DIR, 'medications.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ESCALATION_FILE = path.join(DATA_DIR, 'escalation.json');

const defaultSettings = {
  sound: 'chime',
  density: 'double',
  vibration: 'standard',
  advanceNotice: 0
};

const defaultEscalation = {
  enabled: true,
  startInterval: 10,
  maxDuration: 45,
  customNudgeText: 'Anh nhắc em nè: mau uống thuốc đúng cữ nha!'
};

const defaultMeds = [
  {
    id: 'med-1',
    name: 'Vitamin & Khoáng chất',
    dosage: '1 viên sau ăn sáng',
    time: '08:00',
    frequency: 'daily',
    daysOfWeek: [],
    dayOfMonth: null,
    active: true
  },
  {
    id: 'med-2',
    name: 'Uống nước ấm',
    dosage: 'Ly 350ml',
    time: '14:00',
    frequency: 'daily',
    daysOfWeek: [],
    dayOfMonth: null,
    active: true
  },
  {
    id: 'med-3',
    name: 'Sắt & Canxi',
    dosage: '1 viên sau ăn tối',
    time: '20:00',
    frequency: 'daily',
    daysOfWeek: [],
    dayOfMonth: null,
    active: true
  }
];

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
        device_info TEXT
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
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
      takenAt: r.taken_at
    }));
  }
  return readJSON(LOGS_FILE, []);
}

async function addLog(logEntry) {
  if (sql) {
    await initDb();
    await sql`
      INSERT INTO logs (medication_id, medication_name, date, status, taken_at)
      VALUES (${logEntry.medicationId}, ${logEntry.medicationName}, ${logEntry.date}, ${logEntry.status}, ${logEntry.takenAt});
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
    const rows = await sql`SELECT * FROM subscriptions`;
    return rows.map(r => ({
      endpoint: r.endpoint,
      keys: r.keys,
      subscribedAt: r.subscribed_at,
      deviceInfo: r.device_info
    }));
  }
  return readJSON(SUBS_FILE, []);
}

async function addSubscription(sub, deviceInfo = '') {
  if (!sub || !sub.endpoint) return null;
  if (sql) {
    await initDb();
    await sql`
      INSERT INTO subscriptions (endpoint, keys, device_info, subscribed_at)
      VALUES (${sub.endpoint}, ${JSON.stringify(sub.keys)}::jsonb, ${deviceInfo}, NOW())
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
    subs[idx] = sub;
  } else {
    subs.push(sub);
  }
  writeJSON(SUBS_FILE, subs);
  return sub;
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
  removeSubscription,
  getSettings,
  updateSettings,
  getEscalation,
  updateEscalation,
  sealRealtimeQuery,
  defaultMeds,
  defaultSettings,
  defaultEscalation
};
