// Hey Let's Drink - Enhanced Concept Client Application

// Elements
const deviceStatus = document.getElementById('device-status');
const statusText = document.getElementById('status-text');
const permissionBanner = document.getElementById('permission-banner');
const btnEnableNoti = document.getElementById('btn-enable-noti');
const iosGuide = document.getElementById('ios-guide');
const currentDateDisplay = document.getElementById('current-date-display');
const btnTestPush = document.getElementById('btn-test-push');

// Hero elements
const heroProgressText = document.getElementById('hero-progress-text');
const heroProgressBar = document.getElementById('hero-progress-bar');
const heroTotalText = document.getElementById('hero-total-text');
const heroStreakText = document.getElementById('hero-streak-text');
const heroNextTime = document.getElementById('hero-next-time');
const heroNextName = document.getElementById('hero-next-name');

// Lists
const todayMedList = document.getElementById('today-medication-list');
const allMedList = document.getElementById('all-medication-list');

// Schedule Form
const addMedForm = document.getElementById('add-med-form');
const medFreqSelect = document.getElementById('med-freq');
const weeklyPicker = document.getElementById('weekly-picker');
const monthlyPicker = document.getElementById('monthly-picker');
const dayChips = document.querySelectorAll('.day-chip');

// Voice Elements
const btnMic = document.getElementById('btn-mic');
const voiceStatus = document.getElementById('voice-status');
const transcriptBox = document.getElementById('transcript-box');
const btnAiParse = document.getElementById('btn-ai-parse');
const aiPreview = document.getElementById('ai-preview');
const aiName = document.getElementById('ai-name');
const aiDosage = document.getElementById('ai-dosage');
const aiTime = document.getElementById('ai-time');
const aiFreq = document.getElementById('ai-freq');
const btnSaveAi = document.getElementById('btn-save-ai');

let swRegistration = null;
let currentAiData = null;
let recognition = null;
let isRecording = false;

// ----------------------------------------------------
// App Initialization
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  detectIOSStandalone();
  await initServiceWorker();
  await checkSubscriptionStatus();
  await loadMedications();
  setupRecurrencePicker();
  setupVoiceRecognition();
  setupEventHandlers();
});

// Helper: Convert Base64 URL to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ----------------------------------------------------
// Tab Navigation
// ----------------------------------------------------
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');
    });
  });
}

function switchToTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// ----------------------------------------------------
// iOS Detection
// ----------------------------------------------------
function detectIOSStandalone() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  if (isIOS && !isStandalone) {
    iosGuide.style.display = 'block';
  }
}

// ----------------------------------------------------
// Service Worker & Push Subscription
// ----------------------------------------------------
async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    updateStatus(false, 'Trình duyệt không hỗ trợ Push');
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('[SW] Registered successfully');
  } catch (err) {
    console.error('[SW Registration Error]', err);
    updateStatus(false, 'Lỗi đăng ký Service Worker');
  }
}

async function checkSubscriptionStatus() {
  if (!swRegistration) return;

  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') {
      updateStatus(true, 'Đã bật thông báo');
      permissionBanner.style.display = 'none';
    } else {
      updateStatus(false, 'Chưa bật thông báo');
      permissionBanner.style.display = 'flex';
    }
  } catch (err) {
    console.error('Error checking subscription:', err);
  }
}

function updateStatus(isConnected, text) {
  statusText.textContent = text;
  if (isConnected) {
    deviceStatus.classList.add('connected');
  } else {
    deviceStatus.classList.remove('connected');
  }
}

async function subscribeDevice() {
  if (!swRegistration) {
    alert('Service Worker chưa sẵn sàng. Hãy tải lại trang.');
    return null;
  }

  // Check iOS Standalone requirement
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone) {
    alert('Trên iPhone (iOS 16.4+), bạn bắt buộc phải bấm nút Chia sẻ ⎋ của Safari -> chọn "Thêm vào Màn hình chính", sau đó mở ứng dụng từ Màn hình chính thì Apple mới cho phép kích hoạt thông báo nhé!');
    return null;
  }

  btnEnableNoti.textContent = 'Đang kích hoạt...';
  btnEnableNoti.disabled = true;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Bạn đã từ chối quyền thông báo. Vui lòng bật lại trong Cài đặt trình duyệt.');
      btnEnableNoti.textContent = 'Bật thông báo ngay';
      btnEnableNoti.disabled = false;
      return null;
    }

    const keyRes = await fetch('/api/vapid-key');
    const { publicKey } = await keyRes.json();

    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    updateStatus(true, 'Đã bật thông báo');
    permissionBanner.style.display = 'none';
    alert('Kích hoạt thông báo thành công trên thiết bị này!');
    return subscription;
  } catch (err) {
    console.error('[Subscription Failed]', err);
    alert('Không thể kích hoạt thông báo: ' + (err.message || 'Lỗi không xác định'));
    btnEnableNoti.textContent = 'Bật thông báo ngay';
    btnEnableNoti.disabled = false;
    return null;
  }
}

// ----------------------------------------------------
// Data Loading & Hero Metric Rendering
// ----------------------------------------------------
async function loadMedications() {
  try {
    const res = await fetch('/api/medications');
    const data = await res.json();

    if (data.date) {
      currentDateDisplay.textContent = `Hôm nay: ${data.date} (Hiện tại: ${data.currentTime})`;
    }

    // 1. Update Hero 3-Column Metric Card (BVIS Style)
    if (data.stats) {
      const { completedToday, totalToday, progressPercent, totalCompletedAllTime, streakDays, nextDose } = data.stats;
      heroProgressText.textContent = `${completedToday}/${totalToday}`;
      heroProgressBar.style.width = `${progressPercent}%`;

      heroTotalText.textContent = totalCompletedAllTime;
      heroStreakText.textContent = `Chuỗi ${streakDays} ngày`;

      if (nextDose) {
        heroNextTime.textContent = nextDose.time;
        heroNextName.textContent = nextDose.name;
      } else {
        heroNextTime.textContent = '--:--';
        heroNextName.textContent = totalToday > 0 ? 'Đã xong hôm nay' : 'Chưa có lịch';
      }
    }

    // 2. Render Today Medications
    renderTodayMedications(data.todayMedications || []);

    // 3. Render All Medications
    renderAllMedications(data.allMedications || []);

  } catch (err) {
    console.error('Error loading medications:', err);
    todayMedList.innerHTML = '<div style="padding: 16px; color: var(--status-missed-text); font-size: 13px;">Không thể tải dữ liệu.</div>';
  }
}

// Render Tab 1: Today Schedule
function renderTodayMedications(meds) {
  if (!meds.length) {
    todayMedList.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Hôm nay không có cữ thuốc nào cần uống.</div>';
    return;
  }

  todayMedList.innerHTML = meds.map(med => {
    const isTaken = med.isTakenToday;
    return `
      <div class="med-card ${isTaken ? 'is-taken' : ''}">
        <div class="med-main">
          <div class="med-time">${med.time}</div>
          <div class="med-name">${escapeHTML(med.name)}</div>
          <div class="med-dosage">${escapeHTML(med.dosage)}</div>
        </div>
        <div class="med-actions">
          ${isTaken
            ? `<span class="badge-taken">Đã uống (${med.takenAt || 'xong'})</span>`
            : `<button class="btn-take" onclick="markTaken('${med.id}')">Đánh dấu đã uống</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

// Render Tab 2: All Medications with Recurrence details
function renderAllMedications(meds) {
  if (!meds.length) {
    allMedList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">Chưa có đơn thuốc nào. Hãy thêm ở trên.</div>';
    return;
  }

  const dayNames = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };

  allMedList.innerHTML = meds.map(med => {
    let freqLabel = 'Hàng ngày';
    if (med.frequency === 'weekly' && Array.isArray(med.daysOfWeek) && med.daysOfWeek.length > 0) {
      freqLabel = 'Hàng tuần: ' + med.daysOfWeek.map(d => dayNames[d] || d).join(', ');
    } else if (med.frequency === 'monthly' && med.dayOfMonth) {
      freqLabel = `Ngày ${med.dayOfMonth} hàng tháng`;
    }

    return `
      <div class="med-card">
        <div class="med-main">
          <div class="med-time">${med.time}</div>
          <div class="med-name">${escapeHTML(med.name)}</div>
          <div class="med-dosage">${escapeHTML(med.dosage)}</div>
          <div class="med-meta">
            <span class="med-badge-freq">${freqLabel}</span>
          </div>
        </div>
        <div class="med-actions">
          <button class="btn-delete" title="Xóa lịch" onclick="deleteMed('${med.id}')">Xóa</button>
        </div>
      </div>
    `;
  }).join('');
}

window.markTaken = async function(id) {
  try {
    const res = await fetch(`/api/medications/${id}/take`, { method: 'POST' });
    if (res.ok) {
      await loadMedications();
    }
  } catch (err) {
    console.error('Error marking dose:', err);
  }
};

window.deleteMed = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa cữ thuốc này?')) return;
  try {
    const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadMedications();
    }
  } catch (err) {
    console.error('Error deleting dose:', err);
  }
};

// ----------------------------------------------------
// Google Calendar Recurrence Picker Logic
// ----------------------------------------------------
function setupRecurrencePicker() {
  medFreqSelect.addEventListener('change', () => {
    const val = medFreqSelect.value;
    if (val === 'weekly') {
      weeklyPicker.style.display = 'block';
      monthlyPicker.style.display = 'none';
    } else if (val === 'monthly') {
      weeklyPicker.style.display = 'none';
      monthlyPicker.style.display = 'block';
    } else {
      weeklyPicker.style.display = 'none';
      monthlyPicker.style.display = 'none';
    }
  });

  dayChips.forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });
}

function getSelectedDaysOfWeek() {
  const selected = [];
  dayChips.forEach(chip => {
    if (chip.classList.contains('selected')) {
      selected.push(Number(chip.getAttribute('data-day')));
    }
  });
  return selected;
}

// ----------------------------------------------------
// Voice Recognition (Web Speech API) & Gemini AI
// ----------------------------------------------------
function setupVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceStatus.textContent = 'Trình duyệt này không hỗ trợ Speech-to-Text. Hãy dùng Google Chrome hoặc Safari.';
    btnMic.disabled = true;
    btnMic.style.opacity = '0.5';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'vi-VN';
  recognition.continuous = false;
  recognition.interimResults = true;

  btnMic.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        transcriptBox.textContent = 'Đang lắng nghe bạn nói...';
        transcriptBox.classList.remove('empty');
        voiceStatus.textContent = 'Đang nghe... Hãy nói tên thuốc, giờ và tần suất.';
        btnMic.classList.add('recording');
        isRecording = true;
        btnAiParse.style.display = 'none';
        aiPreview.style.display = 'none';
        recognition.start();
      } catch (err) {
        console.error('Speech recognition start error:', err);
      }
    }
  });

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    const currentText = (final || interim).trim();
    if (currentText) {
      transcriptBox.textContent = currentText;
      transcriptBox.classList.remove('empty');
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    voiceStatus.textContent = 'Lỗi thu âm: ' + event.error;
    btnMic.classList.remove('recording');
    isRecording = false;
  };

  recognition.onend = () => {
    btnMic.classList.remove('recording');
    isRecording = false;
    const spoken = transcriptBox.textContent.trim();
    if (spoken && !transcriptBox.classList.contains('empty') && spoken !== 'Đang lắng nghe bạn nói...') {
      voiceStatus.textContent = 'Đã thu âm xong. Nhấn bên dưới để AI trích xuất.';
      btnAiParse.style.display = 'block';
    } else {
      voiceStatus.textContent = 'Chạm vào micro để nói lại.';
    }
  };

  // Trigger Gemini AI parsing
  btnAiParse.addEventListener('click', async () => {
    const text = transcriptBox.textContent.trim();
    if (!text) return;

    btnAiParse.textContent = 'Gemini AI đang phân tích...';
    btnAiParse.disabled = true;

    try {
      const res = await fetch('/api/ai/parse-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const result = await res.json();

      if (result.success && result.data) {
        currentAiData = result.data;
        aiName.textContent = currentAiData.name || '-';
        aiDosage.textContent = currentAiData.dosage || '-';
        aiTime.textContent = currentAiData.time || '-';
        
        let freqStr = 'Hàng ngày';
        if (currentAiData.frequency === 'weekly') {
          const dayNames = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };
          freqStr = 'Hàng tuần (' + (currentAiData.daysOfWeek || []).map(d => dayNames[d] || d).join(', ') + ')';
        } else if (currentAiData.frequency === 'monthly') {
          freqStr = `Ngày ${currentAiData.dayOfMonth} hàng tháng`;
        }
        aiFreq.textContent = freqStr;

        aiPreview.style.display = 'block';
        btnAiParse.style.display = 'none';
      } else {
        alert('AI không thể trích xuất thông tin: ' + (result.error || 'Thử nói rõ hơn'));
      }
    } catch (err) {
      console.error('AI Parse error:', err);
      alert('Lỗi kết nối AI: ' + err.message);
    } finally {
      btnAiParse.textContent = 'Gemini AI Phân Tích & Điền Lịch';
      btnAiParse.disabled = false;
    }
  });

  // Save AI extracted medication
  btnSaveAi.addEventListener('click', async () => {
    if (!currentAiData) return;
    btnSaveAi.textContent = 'Đang lưu...';
    btnSaveAi.disabled = true;

    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentAiData)
      });

      if (res.ok) {
        alert('Đã lưu cữ thuốc thành công!');
        aiPreview.style.display = 'none';
        transcriptBox.textContent = 'Nội dung thu âm sẽ xuất hiện ở đây...';
        transcriptBox.classList.add('empty');
        currentAiData = null;
        await loadMedications();
        switchToTab('tab-today');
      }
    } catch (err) {
      console.error('Error saving AI med:', err);
    } finally {
      btnSaveAi.textContent = 'Lưu Cữ Thuốc Này';
      btnSaveAi.disabled = false;
    }
  });
}

// ----------------------------------------------------
// Form Handlers & Test Push
// ----------------------------------------------------
// Setup Event Handlers
function setupEventHandlers() {
  btnEnableNoti.addEventListener('click', subscribeDevice);

  // Make header status pill clickable to subscribe
  deviceStatus.style.cursor = 'pointer';
  deviceStatus.addEventListener('click', () => {
    if (!deviceStatus.classList.contains('connected')) {
      subscribeDevice();
    }
  });

  // Manual Add Form
  addMedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('med-name');
    const dosageInput = document.getElementById('med-dosage');
    const timeInput = document.getElementById('med-time');
    const freqVal = medFreqSelect.value;
    const monthDayInput = document.getElementById('med-month-day');

    const name = nameInput.value.trim();
    const dosage = dosageInput.value.trim();
    const time = timeInput.value;
    const daysOfWeek = freqVal === 'weekly' ? getSelectedDaysOfWeek() : [];
    const dayOfMonth = freqVal === 'monthly' ? Number(monthDayInput.value) : null;

    if (!name || !time) return;

    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          dosage,
          time,
          frequency: freqVal,
          daysOfWeek,
          dayOfMonth
        })
      });

      if (res.ok) {
        nameInput.value = '';
        dosageInput.value = '';
        timeInput.value = '';
        dayChips.forEach(c => c.classList.remove('selected'));
        monthDayInput.value = '';
        await loadMedications();
        switchToTab('tab-today');
      }
    } catch (err) {
      console.error('Error creating medication:', err);
    }
  });

  // Test Push Button (Sends directly to this device's subscription)
  btnTestPush.addEventListener('click', async () => {
    btnTestPush.textContent = 'Đang gửi...';
    btnTestPush.disabled = true;

    try {
      if (!swRegistration) {
        alert('Service Worker chưa sẵn sàng. Hãy tải lại trang.');
        btnTestPush.textContent = 'Gửi thử thông báo';
        btnTestPush.disabled = false;
        return;
      }

      // 1. Get or create current device subscription
      let sub = await swRegistration.pushManager.getSubscription();
      if (!sub) {
        // If not subscribed yet, attempt to subscribe first
        sub = await subscribeDevice();
      }

      if (!sub) {
        btnTestPush.textContent = 'Gửi thử thông báo';
        btnTestPush.disabled = false;
        return;
      }

      // 2. Send push directly to this device's subscription
      const res = await fetch('/api/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub })
      });

      const data = await res.json();
      btnTestPush.textContent = 'Đã gửi test!';

      setTimeout(() => {
        btnTestPush.textContent = 'Gửi thử thông báo';
        btnTestPush.disabled = false;
      }, 2500);

      if (data.details && data.details.sent > 0) {
        alert('Đã gửi thông báo thành công! Hãy khóa màn hình hoặc kiểm tra thanh thông báo điện thoại.');
      } else {
        alert('Không gửi được: ' + (data.error || 'Vui lòng kiểm tra lại quyền thông báo'));
      }
    } catch (err) {
      console.error('Test push error:', err);
      alert('Lỗi gửi thông báo: ' + err.message);
      btnTestPush.textContent = 'Gửi thử thông báo';
      btnTestPush.disabled = false;
    }
  });
}

// Utility: Prevent XSS
function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
