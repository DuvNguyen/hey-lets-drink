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
const addDayChips = document.querySelectorAll('#weekly-picker .day-chip');

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
let currentMedsList = [];
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
  setupEditModal();
  setupVoiceRecognition();
  setupEventHandlers();
  initNeonRealtime();

  const streakBackdrop = document.getElementById('streak-celebration-backdrop');
  if (streakBackdrop) {
    streakBackdrop.addEventListener('click', (e) => {
      if (e.target === streakBackdrop) closeStreakModal();
    });
  }
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

  // Gear button to open Settings & Device Modal
  const btnSettingsGear = document.getElementById('btn-settings-gear');
  if (btnSettingsGear) {
    btnSettingsGear.addEventListener('click', () => {
      openSettingsModal();
    });
  }

  // Close Settings button to dismiss modal
  const btnCloseSettings = document.getElementById('btn-close-settings');
  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      closeSettingsModal();
    });
  }

  // Backdrop click to close Settings Modal
  const settingsModal = document.getElementById('settings-modal-backdrop');
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        closeSettingsModal();
      }
    });
  }

  // Keyboard Escape key to dismiss open modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      if (typeof closeEditModal === 'function') closeEditModal();
      if (typeof closeStreakModal === 'function') closeStreakModal();
    }
  });
}

window.openSettingsModal = function() {
  const modal = document.getElementById('settings-modal-backdrop');
  if (modal) {
    modal.classList.add('open');
    checkSubscriptionStatus();
  }
};

window.closeSettingsModal = function() {
  const modal = document.getElementById('settings-modal-backdrop');
  if (modal) {
    modal.classList.remove('open');
  }
};

function switchToTab(tabId) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  tabBtns.forEach(b => b.classList.remove('active'));
  tabPanels.forEach(p => p.classList.remove('active'));

  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');

  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
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
    await swRegistration.update().catch(() => {});
    console.log('[SW] Registered & updated successfully');
  } catch (err) {
    console.error('[SW Registration Error]', err);
    updateStatus(false, 'Lỗi đăng ký Service Worker');
  }
}

async function checkSubscriptionStatus() {
  if (!swRegistration) return;

  const toggleDeviceNoti = document.getElementById('toggle-device-noti');
  const deviceNotiDesc = document.getElementById('device-noti-desc');
  const cardDeviceNoti = document.getElementById('card-device-noti');

  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') {
      let isEnabled = true;
      try {
        const res = await fetch(`/api/subscription/status?endpoint=${encodeURIComponent(subscription.endpoint)}`);
        if (res.ok) {
          const data = await res.json();
          isEnabled = data.enabled !== false;
        }
      } catch (e) {
        console.warn('Error checking subscription status from server:', e);
      }

      if (toggleDeviceNoti) {
        toggleDeviceNoti.checked = isEnabled;
        toggleDeviceNoti.disabled = false;
      }
      if (cardDeviceNoti) cardDeviceNoti.style.display = 'block';

      if (isEnabled) {
        updateStatus(true, 'Đã bật thông báo');
        if (deviceNotiDesc) deviceNotiDesc.textContent = 'Nhận thông báo và chuông nhắc khi đến cữ uống thuốc.';
      } else {
        updateStatus(false, 'Đã tạm tắt thông báo');
        if (deviceNotiDesc) deviceNotiDesc.textContent = 'Đã tắt nhận thông báo trên thiết bị này. Các máy khác vẫn nhận bình thường.';
      }
      permissionBanner.style.display = 'none';
    } else {
      updateStatus(false, 'Chưa bật thông báo');
      if (toggleDeviceNoti) {
        toggleDeviceNoti.checked = false;
        toggleDeviceNoti.disabled = true;
      }
      if (deviceNotiDesc) deviceNotiDesc.textContent = 'Cần bấm nút "Bật thông báo ngay" bên dưới để kích hoạt.';
      permissionBanner.style.display = 'flex';
    }
  } catch (err) {
    console.error('Error checking subscription:', err);
  }
}

// ----------------------------------------------------
// In-App Toast Notification
// ----------------------------------------------------
function showToast(message, type = 'info', duration = 3500) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const colors = {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#38BDF8'
  };

  toast.innerHTML = `<span style="font-weight:700; color:${colors[type] || '#FFF'}; margin-right:4px;">${icons[type] || '•'}</span><span>${message}</span>`;
  toast.classList.add('show');

  if (window._toastTimer) clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
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
    showToast('Service Worker chưa sẵn sàng. Hãy đảm bảo bạn truy cập qua HTTPS hoặc localhost.', 'warning');
    return null;
  }

  // Check iOS Standalone requirement (Apple strictly requires Add to Home Screen for Web Push)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone) {
    showToast('Trên iPhone Safari, bạn cần bấm nút Chia sẻ ⎋ -> "Thêm vào MH chính" để Apple cho phép nhận thông báo!', 'warning', 5000);
    return null;
  }

  btnEnableNoti.textContent = 'Đang kích hoạt...';
  btnEnableNoti.disabled = true;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Bạn đã từ chối quyền thông báo. Vui lòng bật lại trong Cài đặt iPhone > Safari.', 'warning');
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

    const toggleDeviceNoti = document.getElementById('toggle-device-noti');
    const deviceNotiDesc = document.getElementById('device-noti-desc');
    if (toggleDeviceNoti) {
      toggleDeviceNoti.checked = true;
      toggleDeviceNoti.disabled = false;
    }
    if (deviceNotiDesc) {
      deviceNotiDesc.textContent = 'Nhận thông báo và chuông nhắc khi đến cữ uống thuốc.';
    }

    showToast('Kích hoạt thông báo thành công trên thiết bị này!', 'success');
    return subscription;
  } catch (err) {
    console.error('[Subscription Failed]', err);
    showToast('Không thể kích hoạt thông báo: ' + (err.message || 'Lỗi không xác định'), 'error');
    btnEnableNoti.textContent = 'Bật thông báo ngay';
    btnEnableNoti.disabled = false;
    return null;
  }
}

// ----------------------------------------------------
// Data Loading & Hero Metric Rendering
// ----------------------------------------------------
async function loadMedications() {
  const heroStreakSpinner = document.getElementById('hero-streak-spinner');
  const heroStreakImg = document.getElementById('hero-streak-img');
  const heroTotalText = document.getElementById('hero-total-text');
  
  if (heroStreakSpinner) heroStreakSpinner.style.display = 'inline-block';
  if (heroStreakImg) heroStreakImg.style.display = 'none';
  if (heroTotalText) heroTotalText.style.display = 'none';

  try {
    const apiUrl = '/api/medications' + (window.location.search || '');
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (data.date) {
      currentDateDisplay.textContent = `Hôm nay: ${data.date} (Hiện tại: ${data.currentTime})`;
    }

    // 1. Update Hero 3-Column Metric Card (BVIS Style)
    if (data.stats) {
      const { completedToday, totalToday, progressPercent, totalCompletedAllTime, streakDays, nextDose } = data.stats;
      heroProgressText.textContent = `${completedToday}/${totalToday}`;
      heroProgressBar.style.width = `${progressPercent}%`;

      renderStreakFlame(streakDays);

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
    currentMedsList = data.allMedications || [];
    renderAllMedications(currentMedsList);

  } catch (err) {
    console.error('Error loading medications:', err);
    todayMedList.innerHTML = '<div style="padding: 16px; color: var(--status-missed-text); font-size: 13px;">Không thể tải dữ liệu.</div>';
  } finally {
    if (heroStreakSpinner) heroStreakSpinner.style.display = 'none';
  }
}

// ----------------------------------------------------
// TikTok Streak Flame with Milestone Ribbon Banner
// Rule: Streak flame officially starts on Day 3
// Tier 1 (3-9d): Lửa Vàng TikTok + Ribbon
// Tier 2 (10-19d): Lửa Cam Bùng Cháy + Ribbon
// Tier 3 (20d+): Lửa Tím Huyền Thoại (Exact from TikTok screenshot) + Ribbon
// ----------------------------------------------------
let currentStreakData = { count: 0, imgSrc: '', label: '', tier: 0 };

function renderStreakFlame(streakDays) {
  const streakSpinner = document.getElementById('hero-streak-spinner');
  const streakBadgeBox = document.getElementById('hero-streak-badge');
  const streakImg = document.getElementById('hero-streak-img');
  const streakRibbonNum = document.getElementById('hero-streak-ribbon-num');
  const streakCount = document.getElementById('hero-total-text');
  const streakSub = document.getElementById('hero-streak-text');
  if (!streakCount || !streakSub) return;

  if (streakSpinner) streakSpinner.style.display = 'none';
  const count = Number(streakDays) || 0;

  // Dưới huy hiệu chuỗi luôn là chữ "Chuỗi ngày"
  streakSub.textContent = 'Chuỗi ngày';
  streakSub.style.display = 'block';

  if (count < 3) {
    // Under 3 days: No flame yet
    if (streakBadgeBox) streakBadgeBox.style.display = 'none';
    streakCount.style.display = 'block';
    streakCount.textContent = count;
    streakCount.className = 'metric-value';

    currentStreakData = { count, imgSrc: '', label: `Chuỗi ${count} ngày`, tier: 0 };
    return;
  }

  // 3+ days: Official TikTok streak flame is active with dynamic Ribbon Banner!
  streakCount.style.display = 'none';

  let tier = 1;
  let blankImg = '/image/tiktok-streak-blank-3.png';
  let modalTitle = 'Lửa Vàng';

  if (count >= 20) {
    tier = 3;
    blankImg = '/image/tiktok-streak-blank-20.png';
    modalTitle = 'Lửa Tím';
  } else if (count >= 10) {
    tier = 2;
    blankImg = '/image/tiktok-streak-blank-10.png';
    modalTitle = 'Lửa Cam';
  }

  if (streakBadgeBox) {
    streakBadgeBox.style.display = 'inline-flex';
    streakBadgeBox.className = `tiktok-streak-badge-box tier-${tier}`;
  }
  if (streakImg) {
    streakImg.src = blankImg;
    streakImg.style.display = 'block';
  }
  if (streakRibbonNum) {
    streakRibbonNum.textContent = count;
    if (count >= 100) {
      streakRibbonNum.style.fontSize = '7px';
    } else if (count >= 10) {
      streakRibbonNum.style.fontSize = '8px';
    } else {
      streakRibbonNum.style.fontSize = '9px';
    }
  }

  currentStreakData = { count, imgSrc: blankImg, label: `${modalTitle} · ${count} ngày`, tier };
}

window.openStreakModal = function() {
  const modal = document.getElementById('streak-celebration-backdrop');
  const modalBadgeBox = document.getElementById('streak-modal-badge-box');
  const modalImg = document.getElementById('streak-modal-img');
  const modalRibbonNum = document.getElementById('streak-modal-ribbon-num');
  const modalPill = document.getElementById('streak-modal-pill-text');
  const modalHint = document.getElementById('streak-modal-hint');
  if (!modal) return;

  const count = currentStreakData.count || 0;
  const tier = currentStreakData.tier || 1;

  if (count < 3) {
    if (modalBadgeBox) modalBadgeBox.className = 'tiktok-streak-modal-box tier-1';
    if (modalImg) modalImg.src = '/image/tiktok-streak-blank-3.png';
    if (modalRibbonNum) modalRibbonNum.textContent = count;
    if (modalPill) modalPill.textContent = `${count}/3 ngày mở lửa`;
    if (modalHint) modalHint.textContent = `Chỉ cần uống thuốc đủ 3 ngày liên tiếp, ngọn lửa TikTok đầu tiên sẽ bùng cháy tặng em! ❤️`;
  } else {
    if (modalBadgeBox) modalBadgeBox.className = `tiktok-streak-modal-box tier-${tier}`;
    if (modalImg) modalImg.src = currentStreakData.imgSrc || '/image/tiktok-streak-blank-20.png';
    if (modalRibbonNum) {
      modalRibbonNum.textContent = count;
      if (count >= 100) {
        modalRibbonNum.style.fontSize = '34px';
      } else if (count >= 10) {
        modalRibbonNum.style.fontSize = '40px';
      } else {
        modalRibbonNum.style.fontSize = '46px';
      }
    }
    if (modalPill) modalPill.textContent = `${count} Streak`;
    if (modalHint) modalHint.textContent = `Đừng để chuỗi 🔥 bị dập tắt! Hãy nhắc em uống thuốc đúng giờ mỗi ngày nha.`;
  }

  modal.classList.add('open');
};

window.closeStreakModal = function() {
  const modal = document.getElementById('streak-celebration-backdrop');
  if (modal) modal.classList.remove('open');
};

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
          <div class="med-actions-row">
            <button class="btn-action-edit" title="Sửa cữ thuốc" onclick="openEditModal('${med.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>Sửa</span>
            </button>
            <button class="btn-action-delete" title="Xóa cữ thuốc" onclick="deleteMed('${med.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Xóa</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

const inFlightActions = new Set();

window.markTaken = async function(id) {
  if (inFlightActions.has(id)) return;
  inFlightActions.add(id);

  try {
    const res = await fetch(`/api/medications/${id}/take`, { 
      method: 'POST',
      headers: {
        'X-Idempotency-Key': `take-${id}-${Date.now()}`
      }
    });
    if (res.ok) {
      showToast('Đã đánh dấu uống thuốc thành công!', 'success');
      await loadMedications();
    } else {
      showToast('Không thể cập nhật cữ thuốc. Vui lòng thử lại.', 'error');
    }
  } catch (err) {
    console.error('Error marking dose:', err);
    showToast('Lỗi kết nối khi đánh dấu cữ thuốc: ' + err.message, 'error');
  } finally {
    setTimeout(() => inFlightActions.delete(id), 1200);
  }
};

window.deleteMed = async function(id) {
  if (inFlightActions.has(`del-${id}`)) return;
  if (!confirm('Bạn có chắc muốn xóa cữ thuốc này?')) return;
  inFlightActions.add(`del-${id}`);

  try {
    const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Đã xóa cữ thuốc thành công', 'info');
      await loadMedications();
    } else {
      showToast('Không thể xóa cữ thuốc này', 'error');
    }
  } catch (err) {
    console.error('Error deleting dose:', err);
    showToast('Lỗi khi xóa: ' + err.message, 'error');
  } finally {
    inFlightActions.delete(`del-${id}`);
  }
};

window.openEditModal = function(id) {
  const med = currentMedsList.find(m => m.id === id);
  if (!med) return;

  const modal = document.getElementById('edit-modal-backdrop');
  const editId = document.getElementById('edit-med-id');
  const editName = document.getElementById('edit-med-name');
  const editDosage = document.getElementById('edit-med-dosage');
  const editTime = document.getElementById('edit-med-time');
  const editFreq = document.getElementById('edit-med-freq');
  const editWeekly = document.getElementById('edit-weekly-picker');
  const editMonthly = document.getElementById('edit-monthly-picker');
  const editMonthDay = document.getElementById('edit-med-month-day');
  const editDayChips = document.querySelectorAll('.edit-day-chip');

  editId.value = med.id;
  editName.value = med.name || '';
  editDosage.value = med.dosage || '';
  editTime.value = med.time || '';
  editFreq.value = med.frequency || 'daily';

  // Toggle subpanels
  editWeekly.style.display = med.frequency === 'weekly' ? 'block' : 'none';
  editMonthly.style.display = med.frequency === 'monthly' ? 'block' : 'none';

  // Days chips
  const days = Array.isArray(med.daysOfWeek) ? med.daysOfWeek : [];
  editDayChips.forEach(chip => {
    const day = Number(chip.getAttribute('data-day'));
    if (days.includes(day)) {
      chip.classList.add('selected');
    } else {
      chip.classList.remove('selected');
    }
  });

  // Month day
  editMonthDay.value = med.dayOfMonth || '';

  modal.classList.add('open');
};

window.closeEditModal = function() {
  const modal = document.getElementById('edit-modal-backdrop');
  if (modal) modal.classList.remove('open');
};

function setupEditModal() {
  const modal = document.getElementById('edit-modal-backdrop');
  const btnClose = document.getElementById('btn-close-edit-modal');
  const btnCancel = document.getElementById('btn-cancel-edit');
  const editFreq = document.getElementById('edit-med-freq');
  const editWeekly = document.getElementById('edit-weekly-picker');
  const editMonthly = document.getElementById('edit-monthly-picker');
  const editDayChips = document.querySelectorAll('.edit-day-chip');
  const editForm = document.getElementById('edit-med-form');

  if (btnClose) btnClose.addEventListener('click', closeEditModal);
  if (btnCancel) btnCancel.addEventListener('click', closeEditModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeEditModal();
    });
  }

  if (editFreq) {
    editFreq.addEventListener('change', () => {
      const val = editFreq.value;
      editWeekly.style.display = val === 'weekly' ? 'block' : 'none';
      editMonthly.style.display = val === 'monthly' ? 'block' : 'none';
    });
  }

  editDayChips.forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });

  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-med-id').value;
      const name = document.getElementById('edit-med-name').value.trim();
      const dosage = document.getElementById('edit-med-dosage').value.trim();
      const time = document.getElementById('edit-med-time').value;
      const freqVal = editFreq.value;
      const monthDay = document.getElementById('edit-med-month-day').value;

      const selectedDays = [];
      editDayChips.forEach(chip => {
        if (chip.classList.contains('selected')) {
          selectedDays.push(Number(chip.getAttribute('data-day')));
        }
      });

      const btnSubmit = document.getElementById('btn-submit-edit');
      btnSubmit.disabled = true;

      try {
        const res = await fetch(`/api/medications/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            dosage,
            time,
            frequency: freqVal,
            daysOfWeek: freqVal === 'weekly' ? selectedDays : [],
            dayOfMonth: freqVal === 'monthly' ? Number(monthDay) : null
          })
        });

        if (res.ok) {
          closeEditModal();
          showToast('Đã cập nhật cữ thuốc thành công!', 'success');
          await loadMedications();
        } else {
          const err = await res.json().catch(() => ({}));
          showToast('Lỗi cập nhật: ' + (err.error || 'Vui lòng kiểm tra lại'), 'error');
        }
      } catch (err) {
        console.error('Error updating medication:', err);
        showToast('Lỗi kết nối: ' + err.message, 'error');
      } finally {
        btnSubmit.disabled = false;
      }
    });
  }
}

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

  addDayChips.forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });
}

function getSelectedDaysOfWeek() {
  const selected = [];
  addDayChips.forEach(chip => {
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
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Make transcript box interactive so users can type if mic isn't available or fails
  transcriptBox.addEventListener('focus', () => {
    if (transcriptBox.classList.contains('empty')) {
      transcriptBox.textContent = '';
      transcriptBox.classList.remove('empty');
    }
  });

  transcriptBox.addEventListener('input', () => {
    const spoken = transcriptBox.textContent.trim();
    if (spoken && !transcriptBox.classList.contains('empty') && spoken.length > 2) {
      btnAiParse.style.display = 'block';
      voiceStatus.textContent = 'Đã có nội dung. Chạm nút bên dưới để AI trích xuất lịch uống.';
    } else {
      btnAiParse.style.display = 'none';
      voiceStatus.textContent = 'Chạm vào micro để nói hoặc gõ nội dung vào ô trên.';
    }
  });

  if (!SpeechRecognition) {
    voiceStatus.textContent = 'Trình duyệt chưa hỗ trợ Speech-to-Text trực tiếp. Bạn có thể gõ nội dung vào ô trên để AI phân tích!';
    btnMic.disabled = true;
    btnMic.style.opacity = '0.5';
  } else {
    recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    // On iOS Safari, interimResults = true frequently triggers audio aborts
    recognition.interimResults = !isIOS;

    btnMic.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
      } else {
        try {
          transcriptBox.textContent = 'Đang lắng nghe bạn nói...';
          transcriptBox.classList.remove('empty');
          voiceStatus.textContent = 'Đang nghe... Hãy nói tên thuốc, giờ và tần suất (vd: Canxi 1 viên lúc 8 giờ sáng).';
          btnMic.classList.add('recording');
          isRecording = true;
          btnAiParse.style.display = 'none';
          aiPreview.style.display = 'none';
          recognition.start();
        } catch (err) {
          console.error('Speech recognition start error:', err);
          showToast('Không thể bật micro: ' + err.message, 'error');
          isRecording = false;
          btnMic.classList.remove('recording');
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
      let errMsg = 'Lỗi thu âm: ' + event.error;
      if (event.error === 'not-allowed') {
        errMsg = isIOS 
          ? 'Chưa cấp quyền Micro hoặc chưa bật "Đọc chính tả" trong Cài đặt iPhone > Bàn phím.' 
          : 'Quyền micro bị từ chối. Vui lòng cho phép quyền truy cập Micro trên trình duyệt.';
      } else if (event.error === 'service-not-allowed') {
        errMsg = 'Dịch vụ giọng nói Apple bị tắt. Hãy vào Cài đặt iPhone > Cài đặt chung > Bàn phím > Bật "Bật Đọc chính tả".';
      } else if (event.error === 'no-speech') {
        errMsg = 'Chưa nhận diện được giọng nói. Bạn có thể chạm mic nói lại hoặc gõ trực tiếp vào ô.';
      } else if (event.error === 'audio-capture') {
        errMsg = 'Không tìm thấy thiết bị thu âm khả dụng.';
      }

      voiceStatus.textContent = errMsg;
      showToast(errMsg, 'error', 4500);
      btnMic.classList.remove('recording');
      isRecording = false;
    };

    recognition.onend = () => {
      btnMic.classList.remove('recording');
      isRecording = false;
      const spoken = transcriptBox.textContent.trim();
      if (spoken && !transcriptBox.classList.contains('empty') && spoken !== 'Đang lắng nghe bạn nói...') {
        voiceStatus.textContent = 'Đã thu âm xong. Nhấn nút bên dưới để Gemini AI trích xuất.';
        btnAiParse.style.display = 'block';
      } else {
        voiceStatus.textContent = 'Chạm vào micro để nói lại hoặc gõ vào ô trên.';
      }
    };
  }

  // Trigger Gemini AI parsing
  btnAiParse.addEventListener('click', async () => {
    const text = transcriptBox.textContent.trim();
    if (!text || text === 'Nội dung thu âm sẽ xuất hiện ở đây (hoặc chạm vào đây để gõ)...' || transcriptBox.classList.contains('empty')) {
      showToast('Vui lòng nói hoặc nhập nội dung cữ thuốc trước khi phân tích.', 'warning');
      return;
    }

    btnAiParse.textContent = 'Gemini AI đang phân tích...';
    btnAiParse.disabled = true;

    try {
      const res = await fetch('/api/ai/parse-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const result = await res.json();

      if (res.ok && result.success && result.data) {
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
        showToast('Gemini AI đã phân tích thông tin thuốc thành công!', 'success');
      } else {
        const errorMsg = result.error || 'AI không thể trích xuất thông tin. Hãy nói hoặc gõ rõ tên thuốc và giờ.';
        voiceStatus.textContent = 'Lỗi AI: ' + errorMsg;
        showToast(errorMsg, 'error', 4500);
      }
    } catch (err) {
      console.error('AI Parse error:', err);
      showToast('Lỗi kết nối Gemini AI: ' + err.message, 'error');
    } finally {
      btnAiParse.textContent = 'Gemini AI Phân Tích & Điền Lịch';
      btnAiParse.disabled = false;
    }
  });

  // Save AI extracted medication (with double-click prevention & idempotency)
  btnSaveAi.addEventListener('click', async () => {
    if (!currentAiData) return;
    if (btnSaveAi.disabled) return;

    btnSaveAi.textContent = 'Đang lưu...';
    btnSaveAi.disabled = true;

    const idempotencyKey = 'ai-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(currentAiData)
      });

      if (res.ok) {
        showToast('Đã lưu cữ thuốc từ AI thành công!', 'success');
        aiPreview.style.display = 'none';
        transcriptBox.textContent = 'Nội dung thu âm sẽ xuất hiện ở đây (hoặc chạm vào đây để gõ)...';
        transcriptBox.classList.add('empty');
        currentAiData = null;
        await loadMedications();
        switchToTab('tab-today');
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast('Không thể lưu cữ thuốc: ' + (errData.error || 'Vui lòng thử lại'), 'error');
      }
    } catch (err) {
      console.error('Error saving AI med:', err);
      showToast('Lỗi khi lưu cữ thuốc: ' + err.message, 'error');
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

  // Toggle notification for current device
  const toggleDeviceNoti = document.getElementById('toggle-device-noti');
  if (toggleDeviceNoti) {
    toggleDeviceNoti.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      if (!swRegistration) {
        showToast('Service Worker chưa sẵn sàng.', 'warning');
        e.target.checked = !isChecked;
        return;
      }

      try {
        const subscription = await swRegistration.pushManager.getSubscription();
        if (!subscription) {
          if (isChecked) {
            await subscribeDevice();
          } else {
            e.target.checked = false;
          }
          return;
        }

        const res = await fetch('/api/subscription/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            enabled: isChecked
          })
        });

        if (res.ok) {
          const deviceNotiDesc = document.getElementById('device-noti-desc');
          if (isChecked) {
            updateStatus(true, 'Đã bật thông báo');
            if (deviceNotiDesc) deviceNotiDesc.textContent = 'Nhận thông báo và chuông nhắc khi đến cữ uống thuốc.';
            showToast('Đã bật thông báo trên thiết bị này', 'success');
          } else {
            updateStatus(false, 'Đã tạm tắt thông báo');
            if (deviceNotiDesc) deviceNotiDesc.textContent = 'Đã tắt nhận thông báo trên thiết bị này. Các máy khác vẫn nhận bình thường.';
            showToast('Đã tắt nhận thông báo trên thiết bị này', 'info');
          }
        } else {
          throw new Error('Server returned ' + res.status);
        }
      } catch (err) {
        console.error('Toggle error:', err);
        showToast('Lỗi cập nhật: ' + err.message, 'error');
        e.target.checked = !isChecked;
      }
    });
  }

  // Make header status pill clickable to subscribe
  deviceStatus.style.cursor = 'pointer';
  deviceStatus.addEventListener('click', () => {
    if (!deviceStatus.classList.contains('connected')) {
      subscribeDevice();
    }
  });

  // Manual Add Form (with Idempotency & double-click locking)
  addMedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-submit-med') || addMedForm.querySelector('button[type="submit"]');
    if (btnSubmit && btnSubmit.disabled) return;

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

    if (!name || !time) {
      showToast('Vui lòng nhập tên thuốc và giờ nhắc', 'warning');
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Đang lưu cữ thuốc...';
    }

    const idempotencyKey = 'manual-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    try {
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        },
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
        showToast('Đã lưu cữ thuốc thành công!', 'success');
        nameInput.value = '';
        dosageInput.value = '';
        timeInput.value = '';
        addDayChips.forEach(c => c.classList.remove('selected'));
        monthDayInput.value = '';
        await loadMedications();
        switchToTab('tab-today');
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast('Không thể lưu cữ thuốc: ' + (errData.error || 'Vui lòng thử lại'), 'error');
      }
    } catch (err) {
      console.error('Error creating medication:', err);
      showToast('Lỗi kết nối khi lưu: ' + err.message, 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Lưu Cữ Thuốc';
      }
    }
  });

  // Test Push Button (Sends directly to this device's subscription)
  btnTestPush.addEventListener('click', async () => {
    btnTestPush.textContent = 'Đang gửi...';
    btnTestPush.disabled = true;

    try {
      if (!swRegistration) {
        showToast('Service Worker chưa sẵn sàng. Hãy đảm bảo chạy trên HTTPS hoặc localhost.', 'warning');
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
        showToast('Đã gửi thông báo thành công! Hãy khóa màn hình hoặc kiểm tra thông báo.', 'success', 5000);
      } else {
        showToast('Không gửi được: ' + (data.error || 'Kiểm tra quyền thông báo trên thiết bị'), 'error');
      }
    } catch (err) {
      console.error('Test push error:', err);
      showToast('Lỗi gửi thông báo: ' + err.message, 'error');
      btnTestPush.textContent = 'Gửi thử thông báo';
      btnTestPush.disabled = false;
    }
  });

  // Save Notification Settings
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const vibrationSelect = document.getElementById('setting-vibration');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      btnSaveSettings.textContent = 'Đang lưu...';
      btnSaveSettings.disabled = true;
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vibration: vibrationSelect ? vibrationSelect.value : 'standard'
          })
        });
        if (res.ok) {
          showToast('Đã lưu cài đặt thông báo!', 'success');
          btnSaveSettings.textContent = 'Đã lưu cài đặt!';
          setTimeout(() => {
            btnSaveSettings.textContent = 'Lưu Cài Đặt Thông Báo';
            btnSaveSettings.disabled = false;
          }, 2000);
        }
      } catch (err) {
        console.error('Error saving settings:', err);
        showToast('Lỗi khi lưu: ' + err.message, 'error');
        btnSaveSettings.textContent = 'Lưu Cài Đặt Thông Báo';
        btnSaveSettings.disabled = false;
      }
    });
  }
}

// Utility: Prevent XSS
function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ----------------------------------------------------
// Neon Realtime Live Synchronization (Cross-Device Sync)
// ----------------------------------------------------
let rtClient = null;
let subMeds = null;
let subLogs = null;

async function initNeonRealtime() {
  if (typeof window.NeonRealtime === 'undefined') {
    return;
  }

  try {
    const res = await fetch('/api/realtime/sealed-queries');
    if (!res.ok) return;
    const { url, sealedMeds, sealedLogs } = await res.json();
    if (!url || !sealedMeds || !sealedLogs) return;

    rtClient = window.NeonRealtime.createRealtimeClient({ url });

    let isInitMeds = true;
    subMeds = rtClient.subscribe(sealedMeds);
    subMeds.onChange(({ status, error }) => {
      if (error) return;
      if (status === 'live') {
        if (!isInitMeds) {
          loadMedications();
        }
        isInitMeds = false;
      }
    });

    let isInitLogs = true;
    subLogs = rtClient.subscribe(sealedLogs);
    subLogs.onChange(({ status, error }) => {
      if (error) return;
      if (status === 'live') {
        if (!isInitLogs) {
          loadMedications();
        }
        isInitLogs = false;
      }
    });
  } catch (err) {
    console.warn('[Realtime] Live sync initialization skipped:', err.message);
  }
}

// Battery saver: Refresh when app tab comes back to foreground
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadMedications();
  }
});
