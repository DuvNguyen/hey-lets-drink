# Hey Let's Drink 💊

> Minimalist medication reminder Progressive Web App (PWA) with Web Push Notifications for iOS (16.4+) & Android, Google Calendar-style recurrence scheduling, and Voice-to-JSON parsing powered by Google Gemini.

---

## ✨ Features

- **Concept Metric Dashboard:** 3-column Hero stats card inspired by BVIS UI/UX (Today's Progress, Total Completed & Streak, Next Dose).
- **Tabbed Architecture:**
  - **Hôm Nay (Today):** Today's scheduled doses with instant "Mark as Taken" action.
  - **Cài Đặt Lịch (Schedule):** Flexible recurrence modeled after Google Calendar: Daily, Weekly (Mon-Sun chips), and Monthly.
  - **Giọng Nói AI (Voice AI):** Realtime Speech-to-Text via Web Speech API + Gemini 3.5 Flash Lite parsing into structured JSON.
  - **Thiết Bị (Device):** Web Push Notification management & iOS Safari Add-to-Home-Screen instructions.
- **Saigon Digital Design System (`SDv26`):**
  - Minimalist palette (Core Blue `#3165F5`, Deep Indigo `#1E0F48`, Neutral Slate `#F8FAFC`).
  - Tactile micro-interactions: 140ms tap feedback (`scale(0.97)`), 220ms smooth card transitions.
  - Strictly zero emoji spam, clean and refined typography (Inter).
- **100% Free Tier Deployable:** Ready for Vercel Serverless with external keep-alive trigger support (`/api/cron-trigger`).

---

## 🚀 Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start
# App runs at http://localhost:3005
```

---

## 🌐 Deploy to Vercel

```bash
# Deploy with Vercel CLI
vercel --prod
```

Configure Environment Variables:
- `GEMINI_API_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

---

## 📚 Documentation

- [THEORY.md](THEORY.md): Comprehensive Web Push API & Architecture theory.
- [design.md](design.md): UI/UX Design System & Motion Specification.
- [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md): Detailed Vercel deployment & mobile testing guide.
