require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3005;
const DATA_DIR = process.env.VERCEL ? '/tmp/hey-lets-drink-data' : path.join(__dirname, 'data');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Data file paths
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const MEDS_FILE = path.join(DATA_DIR, 'medications.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// Helper to read JSON safely
function readJSON(file, defaultValue) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const content = fs.readFileSync(file, 'utf8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
    return defaultValue;
  }
}

// Helper to write JSON safely
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Initialize VAPID Keys (Supports Environment Variables or persistent file)
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(VAPID_FILE)) {
    vapidKeys = readJSON(VAPID_FILE, null);
  }
}

if (!vapidKeys || !vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = webpush.generateVAPIDKeys();
  try {
    writeJSON(VAPID_FILE, vapidKeys);
  } catch (e) {
    // ignore in read-only environment
  }
  console.log('Generated new VAPID keys.');
}

webpush.setVapidDetails(
  'mailto:contact@heyletsdrink.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Initialize default medications if empty or outdated
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
    frequency: 'weekly',
    daysOfWeek: [1, 2, 3, 4, 5],
    dayOfMonth: null,
    active: true
  }
];

if (!fs.existsSync(MEDS_FILE)) {
  writeJSON(MEDS_FILE, defaultMeds);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Date/Time Helpers (Asia/Ho_Chi_Minh)
function getVNTime() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

function getTodayString() {
  const vnTime = getVNTime();
  const yyyy = vnTime.getFullYear();
  const mm = String(vnTime.getMonth() + 1).padStart(2, '0');
  const dd = String(vnTime.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentTimeString() {
  const vnTime = getVNTime();
  const hh = String(vnTime.getHours()).padStart(2, '0');
  const mm = String(vnTime.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Check if a medication is scheduled for today (Daily, Weekly, Monthly)
function isMedicationScheduledForToday(med, vnTime = getVNTime()) {
  if (!med.active) return false;

  const freq = med.frequency || 'daily';
  if (freq === 'daily') return true;

  if (freq === 'weekly') {
    const jsDay = vnTime.getDay();
    const currentDayOfWeek = jsDay === 0 ? 7 : jsDay;
    return Array.isArray(med.daysOfWeek) && med.daysOfWeek.includes(currentDayOfWeek);
  }

  if (freq === 'monthly') {
    const currentDayOfMonth = vnTime.getDate();
    return Number(med.dayOfMonth) === currentDayOfMonth;
  }

  return true;
}

// Push Notification Dispatcher
async function broadcastPush(payload) {
  const subscriptions = readJSON(SUBS_FILE, []);
  if (!subscriptions.length) {
    console.log('[Push] No active subscriptions found.');
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const activeSubs = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sent++;
      activeSubs.push(sub);
    } catch (err) {
      failed++;
      console.error('[Push Error]', err.statusCode || err.message);
      if (err.statusCode !== 404 && err.statusCode !== 410) {
        activeSubs.push(sub);
      }
    }
  }

  if (activeSubs.length !== subscriptions.length) {
    writeJSON(SUBS_FILE, activeSubs);
    console.log(`[Push Cleanup] Removed ${subscriptions.length - activeSubs.length} dead subscription(s).`);
  }

  return { sent, failed };
}

// Check and trigger scheduled reminders
async function checkAndSendReminders() {
  const vnTime = getVNTime();
  const currentTime = getCurrentTimeString();
  const today = getTodayString();
  const meds = readJSON(MEDS_FILE, []);
  const logs = readJSON(LOGS_FILE, []);

  const dueMeds = meds.filter(m => m.active && m.time === currentTime && isMedicationScheduledForToday(m, vnTime));
  if (!dueMeds.length) return 0;

  let triggered = 0;
  for (const med of dueMeds) {
    const alreadyTaken = logs.some(l => l.medicationId === med.id && l.date === today && l.status === 'TAKEN');
    if (!alreadyTaken) {
      console.log(`[Reminder Triggered] ${med.name} at ${currentTime}`);
      await broadcastPush({
        title: `Lịch uống thuốc: ${med.name}`,
        body: `Đến giờ cữ ${med.time} (${med.dosage}). Vui lòng uống thuốc đúng giờ.`,
        tag: `med-${med.id}-${today}`,
        data: {
          medicationId: med.id,
          time: med.time,
          date: today,
          url: '/'
        }
      });
      triggered++;
    }
  }
  return triggered;
}

// ---------------- REST APIs ----------------

// 1. Get VAPID public key
app.get('/api/vapid-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// 2. Register/Subscribe device
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  const subscriptions = readJSON(SUBS_FILE, []);
  const exists = subscriptions.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    subscriptions.push({
      ...subscription,
      subscribedAt: new Date().toISOString()
    });
    writeJSON(SUBS_FILE, subscriptions);
    console.log('[Subscribe] New device registered. Total devices:', subscriptions.length);
  }

  res.status(201).json({ status: 'subscribed', totalDevices: subscriptions.length });
});

// 3. List medications + Today status + Hero metric stats
app.get('/api/medications', (req, res) => {
  const meds = readJSON(MEDS_FILE, []);
  const logs = readJSON(LOGS_FILE, []);
  const today = getTodayString();
  const currentTime = getCurrentTimeString();
  const vnTime = getVNTime();

  // Annotate all medications with today's status
  const annotated = meds.map(med => {
    const isScheduledToday = isMedicationScheduledForToday(med, vnTime);
    const todayLog = logs.find(l => l.medicationId === med.id && l.date === today && l.status === 'TAKEN');
    return {
      ...med,
      isScheduledToday,
      isTakenToday: !!todayLog,
      takenAt: todayLog ? todayLog.takenAt : null,
      isPast: med.time < currentTime
    };
  });

  // Sort by time ascending
  annotated.sort((a, b) => a.time.localeCompare(b.time));

  // Today specific items
  const todayMeds = annotated.filter(m => m.isScheduledToday);
  const completedToday = todayMeds.filter(m => m.isTakenToday).length;
  const totalToday = todayMeds.length;
  const progressPercent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  // Next dose calculation
  const upcomingToday = todayMeds.find(m => !m.isTakenToday && !m.isPast);
  const nextDose = upcomingToday
    ? { time: upcomingToday.time, name: upcomingToday.name, dosage: upcomingToday.dosage }
    : (todayMeds.find(m => !m.isTakenToday) || (todayMeds[0] ? { time: todayMeds[0].time, name: todayMeds[0].name, dosage: todayMeds[0].dosage } : null));

  // Total completed doses all-time & streak
  const totalCompletedAllTime = logs.filter(l => l.status === 'TAKEN').length;
  
  // Calculate consecutive days streak
  const uniqueDates = [...new Set(logs.filter(l => l.status === 'TAKEN').map(l => l.date))].sort().reverse();
  let streak = 0;
  if (uniqueDates.length > 0) {
    let checkDate = new Date(vnTime);
    const todayTaken = uniqueDates.includes(today);
    if (!todayTaken) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (true) {
      const yyyy = checkDate.getFullYear();
      const mm = String(checkDate.getMonth() + 1).padStart(2, '0');
      const dd = String(checkDate.getDate()).padStart(2, '0');
      const dStr = `${yyyy}-${mm}-${dd}`;
      if (uniqueDates.includes(dStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  res.json({
    date: today,
    currentTime,
    stats: {
      completedToday,
      totalToday,
      progressPercent,
      totalCompletedAllTime,
      streakDays: Math.max(streak, completedToday > 0 ? 1 : 0),
      nextDose
    },
    todayMedications: todayMeds,
    allMedications: annotated
  });
});

// 4. Create new medication (supports Daily, Weekly, Monthly)
app.post('/api/medications', (req, res) => {
  const { name, dosage, time, frequency, daysOfWeek, dayOfMonth } = req.body;
  if (!name || !time) {
    return res.status(400).json({ error: 'Name and time are required' });
  }

  const meds = readJSON(MEDS_FILE, []);
  const newMed = {
    id: `med-${Date.now()}`,
    name: name.trim(),
    dosage: (dosage || 'Theo chỉ định').trim(),
    time: time.trim(),
    frequency: ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'daily',
    daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek.map(Number) : [],
    dayOfMonth: dayOfMonth ? Number(dayOfMonth) : null,
    active: true,
    createdAt: new Date().toISOString()
  };

  meds.push(newMed);
  writeJSON(MEDS_FILE, meds);
  res.status(201).json(newMed);
});

// 5. Delete medication
app.delete('/api/medications/:id', (req, res) => {
  const { id } = req.params;
  let meds = readJSON(MEDS_FILE, []);
  const initialLength = meds.length;
  meds = meds.filter(m => m.id !== id);

  if (meds.length === initialLength) {
    return res.status(404).json({ error: 'Medication not found' });
  }

  writeJSON(MEDS_FILE, meds);
  res.json({ success: true, message: 'Deleted' });
});

// 6. Mark medication as taken
app.post('/api/medications/:id/take', (req, res) => {
  const { id } = req.params;
  const meds = readJSON(MEDS_FILE, []);
  const med = meds.find(m => m.id === id);
  if (!med) {
    return res.status(404).json({ error: 'Medication not found' });
  }

  const today = getTodayString();
  const logs = readJSON(LOGS_FILE, []);
  const existingIndex = logs.findIndex(l => l.medicationId === id && l.date === today);

  const logEntry = {
    medicationId: id,
    medicationName: med.name,
    date: today,
    status: 'TAKEN',
    takenAt: new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
  };

  if (existingIndex >= 0) {
    logs[existingIndex] = logEntry;
  } else {
    logs.push(logEntry);
  }

  writeJSON(LOGS_FILE, logs);
  res.json({ success: true, log: logEntry });
});

// 7. Voice-to-JSON AI Parser using Gemini 3.5 Flash Lite
app.post('/api/ai/parse-speech', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text transcript is required' });
  }

  const promptText = `You are an AI assistant for a medication scheduling app.
Extract medication details from this user voice transcript into a clean JSON object:
Voice transcript: "${text.trim()}"

Rules:
- name: Medication name (e.g. "Panadol", "Canxi", "Vitamin C").
- dosage: Dosage and instructions (e.g. "1 viên sau ăn sáng", "500mg"). If not mentioned, return "1 viên".
- time: Scheduled time in 24-hour format HH:mm (e.g. "08:00", "14:30", "20:00"). If only morning/evening without exact hour, default morning to "08:00", afternoon to "14:00", evening/night to "20:00".
- frequency: "daily" | "weekly" | "monthly". Default to "daily" unless specific days or months are mentioned.
- daysOfWeek: Array of integers where 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday (e.g. [1,3,5] for Mon/Wed/Fri). Empty array if frequency is "daily" or "monthly".
- dayOfMonth: Integer 1-31 if frequency is "monthly", otherwise null.

Respond ONLY with valid JSON. No conversational text or markdown code fences.`;

  const payload = JSON.stringify({
    contents: [{
      parts: [{ text: promptText }]
    }],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  
  const aiReq = https.request(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (aiRes) => {
    let body = '';
    aiRes.on('data', chunk => body += chunk);
    aiRes.on('end', () => {
      try {
        const responseData = JSON.parse(body);
        if (responseData.error) {
          console.error('[Gemini Error]', responseData.error);
          return res.status(500).json({ error: responseData.error.message });
        }
        const candidateText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) {
          return res.status(500).json({ error: 'No response from AI model' });
        }
        const parsed = JSON.parse(candidateText.trim());
        res.json({ success: true, data: parsed });
      } catch (err) {
        console.error('[AI Parse Error]', err.message, body);
        res.status(500).json({ error: 'Failed to parse AI response' });
      }
    });
  });

  aiReq.on('error', (err) => {
    console.error('[Gemini Request Error]', err);
    res.status(500).json({ error: 'Could not connect to Gemini API' });
  });

  aiReq.write(payload);
  aiReq.end();
});

// 8. Test push notification immediately
app.post('/api/test-push', async (req, res) => {
  const currentTime = getCurrentTimeString();
  const payload = {
    title: 'Kiểm tra thông báo: Hey Let\'s Drink',
    body: `Thiết bị đã kết nối thành công lúc ${currentTime}. Hệ thống sẽ nhắc lịch đúng giờ.`,
    tag: 'test-push',
    data: { url: '/' }
  };

  const result = await broadcastPush(payload);
  res.json({
    status: 'sent',
    details: result
  });
});

// 9. Cron Trigger endpoint (For external keep-alive e.g. cron-job.org)
app.get('/api/cron-trigger', async (req, res) => {
  const currentTime = getCurrentTimeString();
  const triggered = await checkAndSendReminders();
  res.json({
    status: 'ok',
    serverTime: currentTime,
    timeZone: 'Asia/Ho_Chi_Minh',
    triggeredCount: triggered
  });
});

// ---------------- Background Cron (Per minute) ----------------
cron.schedule('* * * * *', async () => {
  try {
    await checkAndSendReminders();
  } catch (err) {
    console.error('[Cron Error]', err.message);
  }
}, {
  timezone: 'Asia/Ho_Chi_Minh'
});

// Start Server if not in Vercel Serverless environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Hey Let's Drink running at http://localhost:${PORT}`);
    console.log(`Server TimeZone: Asia/Ho_Chi_Minh (Current time: ${getCurrentTimeString()})`);
  });
}

module.exports = app;
