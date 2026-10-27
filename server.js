require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3005;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Fixed VAPID Keys fallback (Ensures Vercel serverless cold starts never desync)
const DEFAULT_VAPID_PUBLIC = 'BM2nC4zvoG3c2GWkNr0gVbuyYcPtvQclIKI9fMPHqv_vHg4-44IWT17LzMUFEaxAKQ9F7u9mSl_uzQf-aU9vaSY';
const DEFAULT_VAPID_PRIVATE = 'qQHldidrKr1VNlydEgdV4bdWXcr_G6y42TuGW9jLuDg';

let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC,
  privateKey: process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE
};

// Apple APNs requires a valid public URI or public email in VAPID details (never use .local)
webpush.setVapidDetails(
  'https://github.com/DuvNguyen/hey-lets-drink',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

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

// Push Notification Dispatcher (Respects per-device enabled status)
async function broadcastPush(payload) {
  const subscriptions = await db.getSubscriptions();
  const activeSubs = subscriptions.filter(sub => sub.enabled !== false);
  if (!activeSubs.length) {
    console.log('[Push] No active/enabled subscriptions found (All devices muted or none registered).');
    return { sent: 0, failed: 0, total: subscriptions.length, active: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const sub of activeSubs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), {
        TTL: 86400,
        urgency: 'high'
      });
      sent++;
    } catch (err) {
      failed++;
      console.error('[Push Error]', err.statusCode || err.message);
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.removeSubscription(sub.endpoint);
        console.log(`[Push Cleanup] Removed dead subscription: ${sub.endpoint}`);
      }
    }
  }

  return { sent, failed, total: subscriptions.length, active: activeSubs.length };
}

function getVibrationPattern(vib) {
  if (vib === 'soft') return [100, 50, 100];
  if (vib === 'urgent') return [300, 100, 300, 100, 300];
  return [200, 100, 200];
}

function getMinutesFromTimeString(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Check and trigger scheduled reminders (with Anki Escalation Mode)
async function checkAndSendReminders() {
  const vnTime = getVNTime();
  const currentTime = getCurrentTimeString();
  const currentMinutes = getMinutesFromTimeString(currentTime);
  const today = getTodayString();
  const meds = await db.getMedications();
  const logs = await db.getLogs();
  const settings = await db.getSettings();
  const escalation = await db.getEscalation();

  let triggered = 0;
  let vibration = getVibrationPattern(settings.vibration);

  for (const med of meds) {
    if (!med.active || !isMedicationScheduledForToday(med, vnTime)) continue;

    const alreadyTaken = logs.some(l => l.medicationId === med.id && l.date === today && l.status === 'TAKEN');
    if (alreadyTaken) continue;

    const medMinutes = getMinutesFromTimeString(med.time);
    const diffMinutes = currentMinutes - medMinutes;

    let shouldTrigger = false;
    let reminderTitle = `Lịch uống thuốc: ${med.name}`;
    let reminderBody = `Cữ ${med.time} (${med.dosage}). Vui lòng uống thuốc và nhấn Xác nhận đã uống.`;

    // 1. On-time check (diff = 0m)
    if (diffMinutes === 0) {
      shouldTrigger = true;
    }
    // 2. Anki Escalation Mode: Faster reminders down to 1 per minute!
    else if (escalation.enabled && diffMinutes > 0 && diffMinutes <= (escalation.maxDuration || 50)) {
      if (diffMinutes === 10) {
        // Stage 1: 10 minutes overdue
        shouldTrigger = true;
        reminderTitle = `[Quá giờ 10p] ${med.name}`;
        reminderBody = `${escalation.stage1Message || 'Quá giờ 10p rồi, em mau uống thuốc nha!'} (Cữ ${med.time})`;
      } else if (diffMinutes === 15) {
        // Stage 2: 5 minutes later
        shouldTrigger = true;
        reminderTitle = `[Quá giờ 15p] ${med.name}`;
        reminderBody = `${escalation.stage2Message || 'Em ơi, quá 15p rồi chưa uống thuốc nè!'} (Cữ ${med.time})`;
      } else if (diffMinutes === 17) {
        // Stage 3: 2 minutes later
        shouldTrigger = true;
        reminderTitle = `[Quá giờ 17p] ${med.name}`;
        reminderBody = `${escalation.stage3Message || 'Uống thuốc ngay nha em, trễ nhiều rồi đó!'} (Cữ ${med.time})`;
        vibration = [300, 100, 300, 100, 300];
      } else if (diffMinutes >= 18) {
        // Stage 4: High urgency -> Fires EVERY 1 MINUTE until marked done!
        shouldTrigger = true;
        reminderTitle = `[Khẩn cấp: Quá giờ ${diffMinutes}p] ${med.name}`;
        reminderBody = `${escalation.stage4Message || 'Khẩn cấp: Mau uống thuốc rồi bấm xác nhận cho anh!'} (Cữ ${med.time})`;
        vibration = [400, 100, 400, 100, 400, 100, 500];
      }
    }
    // 3. Fallback density if Anki escalation is disabled
    else if (!escalation.enabled && settings.density === 'double' && diffMinutes === 10) {
      shouldTrigger = true;
      reminderTitle = `[Nhắc lại] Lịch uống thuốc: ${med.name}`;
      reminderBody = `Đã qua giờ cữ ${med.time} (${med.dosage}). Vui lòng uống thuốc.`;
    }

    if (shouldTrigger) {
      console.log(`[Reminder Triggered] ${reminderTitle} at ${currentTime} (Overdue: ${diffMinutes}m)`);
      await broadcastPush({
        title: reminderTitle,
        body: reminderBody,
        tag: `med-${med.id}-${today}`,
        vibrate: vibration,
        data: {
          medicationId: med.id,
          time: med.time,
          date: today,
          vibrate: vibration,
          url: '/'
        }
      });
      triggered++;
    }
  }

  return triggered;
}

// ---------------- REST APIs ----------------

// Admin Panel Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin API: Get status & girlfriend progress
app.get('/api/admin/status', async (req, res) => {
  const vnTime = getVNTime();
  const currentTime = getCurrentTimeString();
  const currentMinutes = getMinutesFromTimeString(currentTime);
  const today = getTodayString();
  const meds = await db.getMedications();
  const logs = await db.getLogs();
  const escalation = await db.getEscalation();
  const subscriptions = await db.getSubscriptions();

  const todayMeds = meds
    .filter(m => m.active && isMedicationScheduledForToday(m, vnTime))
    .map(med => {
      const todayLog = logs.find(l => l.medicationId === med.id && l.date === today && l.status === 'TAKEN');
      const medMinutes = getMinutesFromTimeString(med.time);
      const diffMinutes = currentMinutes - medMinutes;
      const isTaken = !!todayLog;
      const isOverdue = !isTaken && diffMinutes > 0;

      let urgencyState = 'Đúng giờ';
      if (isTaken) {
        urgencyState = `Đã uống (${todayLog.takenAt})`;
      } else if (diffMinutes < 0) {
        urgencyState = `Chưa đến cữ (còn ${Math.abs(diffMinutes)} phút)`;
      } else if (diffMinutes === 0) {
        urgencyState = 'Đang đến cữ';
      } else if (diffMinutes < 10) {
        urgencyState = `Đang chờ chặng 1 (sau ${10 - diffMinutes}p sẽ nhắc lại)`;
      } else if (diffMinutes < 15) {
        urgencyState = `Chặng 1 (sau ${15 - diffMinutes}p sẽ nhắc tiếp)`;
      } else if (diffMinutes < 17) {
        urgencyState = `Chặng 2 (sau ${17 - diffMinutes}p sẽ nhắc tiếp)`;
      } else if (diffMinutes <= (escalation.maxDuration || 45)) {
        urgencyState = `🚨 Chặng khẩn cấp (Đang bắn 1 lần / phút)`;
      } else {
        urgencyState = 'Quá hạn tối đa';
      }

      return {
        ...med,
        isTaken,
        takenAt: todayLog ? todayLog.takenAt : null,
        isOverdue,
        diffMinutes: Math.max(0, diffMinutes),
        urgencyState
      };
    });

  res.json({
    date: today,
    currentTime,
    totalDevices: subscriptions.length,
    activeDevices: subscriptions.filter(s => s.enabled !== false).length,
    escalation,
    todayMeds
  });
});

// Admin API: List all devices with enabled status
app.get('/api/admin/devices', async (req, res) => {
  const subscriptions = await db.getSubscriptions();
  res.json({
    total: subscriptions.length,
    active: subscriptions.filter(s => s.enabled !== false).length,
    devices: subscriptions.map(sub => ({
      endpoint: sub.endpoint,
      deviceInfo: sub.deviceInfo,
      subscribedAt: sub.subscribedAt,
      enabled: sub.enabled !== false
    }))
  });
});

// Admin API: Toggle notification on/off for a specific device
app.post('/api/admin/devices/toggle', async (req, res) => {
  const { endpoint, enabled } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }
  const isEnabled = enabled !== false;
  await db.updateSubscriptionEnabled(endpoint, isEnabled);
  res.json({ success: true, endpoint, enabled: isEnabled });
});

// Admin API: Remove/Unregister a dead or unwanted device
app.delete('/api/admin/devices', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }
  await db.removeSubscription(endpoint);
  res.json({ success: true, endpoint });
});

// Admin API: Update Escalation Config
app.post('/api/admin/escalation-config', async (req, res) => {
  const updated = await db.updateEscalation(req.body);
  res.json({ success: true, escalation: updated });
});

// Admin API: Boyfriend manual instant nudge
app.post('/api/admin/nudge', async (req, res) => {
  const { message } = req.body;
  const currentTime = getCurrentTimeString();
  const nudgeText = message || 'Anh nhắc em nè: mau uống thuốc đúng cữ nha!';

  const payload = {
    title: 'Lời nhắc từ bạn trai 💬',
    body: `${nudgeText} (${currentTime})`,
    tag: `nudge-${Date.now()}`,
    vibrate: [300, 100, 300, 100, 500],
    data: { url: '/' }
  };

  const result = await broadcastPush(payload);
  res.json({
    success: true,
    sentTo: result.sent,
    message: nudgeText
  });
});

// 1. Get VAPID public key
app.get('/api/vapid-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Settings APIs
app.get('/api/settings', async (req, res) => {
  const settings = await db.getSettings();
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  const updated = await db.updateSettings(req.body);
  res.json({ success: true, settings: updated });
});

// 2. Register/Subscribe device
app.post('/api/subscribe', async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  const deviceInfo = req.headers['user-agent'] || '';
  await db.addSubscription(subscription, deviceInfo);
  const subscriptions = await db.getSubscriptions();
  console.log('[Subscribe] Device registered in Neon DB. Total devices:', subscriptions.length);

  res.status(201).json({ status: 'subscribed', totalDevices: subscriptions.length });
});

// 3. List medications + Today status + Hero metric stats
app.get('/api/medications', async (req, res) => {
  const meds = await db.getMedications();
  const logs = await db.getLogs();
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
      streakDays: req.query.streak !== undefined ? Number(req.query.streak) : streak,
      nextDose
    },
    todayMedications: todayMeds,
    allMedications: annotated
  });
});

// Idempotency & deduplication stores
const idempotencyStore = new Map();
const recentCreations = new Map();

// Periodic cleanup of idempotency caches (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of recentCreations.entries()) {
    if (now - val.timestamp > 60000) recentCreations.delete(key);
  }
  if (idempotencyStore.size > 1000) idempotencyStore.clear();
}, 10 * 60 * 1000);

// 4. Create new medication (supports Daily, Weekly, Monthly with Idempotency)
app.post('/api/medications', async (req, res) => {
  const { name, dosage, time, frequency, daysOfWeek, dayOfMonth } = req.body;
  if (!name || !time) {
    return res.status(400).json({ error: 'Name and time are required' });
  }

  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    const cached = idempotencyStore.get(idempotencyKey);
    console.log(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);
    return res.status(cached.status).json(cached.body);
  }

  // Deduplicate rapid double submissions (e.g. exact same med created within 3 seconds)
  const dedupeKey = `${name.trim().toLowerCase()}_${time.trim()}_${frequency || 'daily'}`;
  const now = Date.now();
  if (recentCreations.has(dedupeKey)) {
    const prev = recentCreations.get(dedupeKey);
    if (now - prev.timestamp < 3000) {
      console.log(`[Idempotency] Prevented rapid duplicate creation for: "${name}" at ${time}`);
      return res.status(200).json(prev.med);
    }
  }

  const newMed = {
    id: `med-${Date.now()}`,
    name: name.trim(),
    dosage: (dosage || 'Theo chỉ định').trim(),
    time: time.trim(),
    frequency: ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'daily',
    daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek.map(Number) : [],
    dayOfMonth: dayOfMonth ? Number(dayOfMonth) : null,
    active: true
  };

  await db.addMedication(newMed);
  recentCreations.set(dedupeKey, { timestamp: now, med: newMed });
  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, { status: 201, body: newMed });
  }
  res.status(201).json(newMed);
});

// 4.5. Update existing medication
app.put('/api/medications/:id', async (req, res) => {
  const { id } = req.params;
  const { name, dosage, time, frequency, daysOfWeek, dayOfMonth } = req.body;
  if (!name || !time) {
    return res.status(400).json({ error: 'Name and time are required' });
  }

  const updates = {
    name: name.trim(),
    dosage: (dosage || 'Theo chỉ định').trim(),
    time: time.trim(),
    frequency: ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'daily',
    daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek.map(Number) : [],
    dayOfMonth: dayOfMonth ? Number(dayOfMonth) : null
  };

  const updated = await db.updateMedication(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Medication not found' });
  }
  res.json({ success: true, medication: updated });
});

// 5. Delete medication
app.delete('/api/medications/:id', async (req, res) => {
  const { id } = req.params;
  const success = await db.deleteMedication(id);
  res.json({ success, message: 'Deleted' });
});

// 6. Mark medication as taken
app.post('/api/medications/:id/take', async (req, res) => {
  const { id } = req.params;
  const meds = await db.getMedications();
  const med = meds.find(m => m.id === id);
  if (!med) {
    return res.status(404).json({ error: 'Medication not found' });
  }

  const today = getTodayString();
  const currentTime = getCurrentTimeString();
  const logEntry = {
    medicationId: id,
    medicationName: med.name,
    date: today,
    status: 'TAKEN',
    takenAt: currentTime
  };

  await db.addLog(logEntry);
  res.json({ success: true, log: logEntry });
});

// Neon Realtime sealed query endpoints
app.get('/api/realtime/sealed-queries', async (req, res) => {
  try {
    if (!process.env.NEON_REALTIME_SECRET || !process.env.NEON_REALTIME_URL) {
      return res.status(503).json({ success: false, error: 'Neon Realtime not configured' });
    }
    const [sealedMeds, sealedLogs] = await Promise.all([
      db.sealRealtimeQuery('SELECT id, name, dosage, time, frequency, active FROM medications', []),
      db.sealRealtimeQuery('SELECT id, medication_id, status, date, taken_at FROM logs ORDER BY id DESC LIMIT 20', [])
    ]);
    res.json({
      success: true,
      url: process.env.NEON_REALTIME_URL,
      sealedMeds,
      sealedLogs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/realtime/sealed-query', async (req, res) => {
  try {
    const sealed = await db.sealRealtimeQuery('SELECT id, name, dosage, time, active FROM medications', []);
    res.json({
      success: true,
      url: process.env.NEON_REALTIME_URL,
      sealed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Voice-to-JSON AI Parser using Gemini with robust multi-model fallback
async function callGeminiWithFallback(promptText) {
  if (!GEMINI_API_KEY) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trên máy chủ');
  }

  // Model fallback chain: fastest and most available first
  const models = ['gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        }),
        signal: AbortSignal.timeout(9000)
      });

      const bodyText = await resp.text();
      let responseData;
      try {
        responseData = JSON.parse(bodyText);
      } catch (parseErr) {
        throw new Error(`Phản hồi AI không hợp lệ (${resp.status}): ${bodyText.slice(0, 100)}`);
      }

      if (!resp.ok || responseData.error) {
        const errMsg = responseData.error?.message || `HTTP ${resp.status}`;
        throw new Error(`[${model}] ${errMsg}`);
      }

      const candidateText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        throw new Error(`[${model}] Phản hồi rỗng`);
      }

      const parsed = JSON.parse(candidateText.trim());
      console.log(`[Gemini] Parsed successfully using model: ${model}`);
      return parsed;
    } catch (err) {
      console.warn(`[Gemini] Model ${model} gặp sự cố: ${err.message}. Đang thử model dự phòng tiếp theo...`);
      lastError = err;
    }
  }

  throw lastError || new Error('Không thể kết nối đến tất cả các mô hình Gemini AI.');
}

app.post('/api/ai/parse-speech', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Nội dung giọng nói hoặc văn bản không được để trống' });
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

  try {
    const data = await callGeminiWithFallback(promptText);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Gemini AI Parse Failed]', err.message);
    res.status(503).json({ 
      error: `Gemini AI hiện đang quá tải hoặc gián đoạn (${err.message}). Bạn có thể thử lại sau vài giây hoặc nhập thủ công.` 
    });
  }
});

// 8. Test push notification immediately
app.post('/api/test-push', async (req, res) => {
  const currentTime = getCurrentTimeString();
  const payload = {
    title: "Kiểm tra thông báo: Hey Let's Drink",
    body: `Thiết bị đã kết nối thành công lúc ${currentTime}. Hệ thống sẽ nhắc lịch đúng giờ.`,
    tag: 'test-push',
    data: { url: '/' }
  };

  // If client provided its own subscription in request body, push to it directly!
  if (req.body && req.body.subscription && req.body.subscription.endpoint) {
    try {
      // Also ensure it is saved in database/storage
      await db.addSubscription(req.body.subscription, req.headers['user-agent'] || '');

      await webpush.sendNotification(req.body.subscription, JSON.stringify(payload), {
        TTL: 86400,
        urgency: 'high'
      });
      return res.json({
        status: 'sent',
        details: { sent: 1, failed: 0 }
      });
    } catch (err) {
      console.error('[Direct Push Error]', err.statusCode || err.message);
      return res.status(err.statusCode || 500).json({
        error: err.message,
        statusCode: err.statusCode
      });
    }
  }

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
if (!process.env.VERCEL) {
  cron.schedule('* * * * *', async () => {
    try {
      await checkAndSendReminders();
    } catch (err) {
      console.error('[Cron Error]', err.message);
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh'
  });
}

// Start Server if not in Vercel Serverless environment
if (!process.env.VERCEL) {
  db.initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`Hey Let's Drink running at http://localhost:${PORT}`);
      console.log(`Server TimeZone: Asia/Ho_Chi_Minh (Current time: ${getCurrentTimeString()})`);
    });
  });
}

module.exports = app;
